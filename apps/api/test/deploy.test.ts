import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { setup } from "./helpers.ts";

const key = randomBytes(32).toString("base64");
const base = { FIELD_ENCRYPTION_KEY: key, DATABASE_URL: "", EMR_BASE_URL: "", MOCK_EMR_URL: "", CRON_SECRET: "", VERCEL: "", VERCEL_ENV: "", EMR_ALLOWED_HOSTS: "", TRUST_PROXY: "", EMERGENCY_NUMBER: "" };

describe("Vercel configuration", () => {
  it("uses the bound mock EMR outside production only", () => {
    expect(loadConfig({ ...base, MOCK_EMR_URL: "http://mock.internal" }).EMR_BASE_URL).toBe("http://mock.internal");
    expect(loadConfig({ ...base, MOCK_EMR_URL: "http://mock.internal", EMR_BASE_URL: "https://emr.example" }).EMR_BASE_URL).toBe("https://emr.example");
    expect(() => loadConfig({ ...base, VERCEL_ENV: "production", MOCK_EMR_URL: "http://mock.internal" })).toThrow(/EMR_BASE_URL/);
    expect(() => loadConfig({ ...base, VERCEL_ENV: "production", EMR_BASE_URL: "http://emr.example" })).toThrow(/https/);
  });

  it("always has a national emergency number and the center's time zone (Jordan unless set)", () => {
    const prod = { ...base, VERCEL_ENV: "production", EMR_BASE_URL: "https://emr.example", DATABASE_URL: "postgres://db.example/vwelfare" };
    expect(loadConfig(prod).EMERGENCY_NUMBER).toBe("911");
    expect(loadConfig({ ...prod, CENTER_TIMEZONE: "" }).CENTER_TIMEZONE).toBe("Asia/Amman");
    expect(() => loadConfig({ ...prod, EMERGENCY_NUMBER: "call me" })).toThrow(/EMERGENCY_NUMBER/);
    expect(loadConfig({ ...prod, EMERGENCY_NUMBER: "999" }).EMERGENCY_NUMBER).toBe("999");
  });

  it("allows only the environment's EMR host unless EMR_ALLOWED_HOSTS lists more", () => {
    expect(loadConfig({ ...base, EMR_BASE_URL: "https://emr.example:8443/api" }).EMR_ALLOWED_HOSTS).toEqual(["emr.example:8443"]);
    expect(loadConfig({ ...base, EMR_BASE_URL: "https://emr.example", EMR_ALLOWED_HOSTS: "emr.example, EMR-DR.example" }).EMR_ALLOWED_HOSTS).toEqual(["emr.example", "emr-dr.example"]);
  });

  it("refuses to start on Vercel without a real database and a cron secret", () => {
    expect(() => loadConfig({ ...base, VERCEL: "1", CRON_SECRET: "s" })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...base, VERCEL: "1", DATABASE_URL: "postgres://x@db/v" })).toThrow(/CRON_SECRET/);
    expect(loadConfig({ ...base, VERCEL: "1", DATABASE_URL: "postgres://x@db/v", CRON_SECRET: "s" }).DATABASE_URL).toBe("postgres://x@db/v");
  });

  it("trusts X-Forwarded-For from a local proxy, Vercel's edge, or the listed proxies", () => {
    const vercel = { ...base, VERCEL: "1", DATABASE_URL: "postgres://x@db/v", CRON_SECRET: "s" };
    expect(loadConfig(base).TRUST_PROXY).toEqual(["127.0.0.1", "::1"]);
    expect(loadConfig(vercel).TRUST_PROXY).toBe(true);
    expect(loadConfig({ ...vercel, TRUST_PROXY: "10.0.0.0/16, 10.1.0.5" }).TRUST_PROXY).toEqual(["10.0.0.0/16", "10.1.0.5"]);
  });
});

describe("scheduled worker endpoint", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    env = await setup();
    env.deps.config.CRON_SECRET = "cron-secret-for-tests";
  });
  afterAll(async () => { await env.teardown(); });

  it("runs the worker only for the cron secret", async () => {
    const { buildApp } = await import("../src/app.ts");
    const app = await buildApp(env.deps);
    const call = (authorization?: string) => app.inject({ method: "GET", url: "/api/internal/worker", headers: authorization ? { authorization } : {} });
    expect((await call()).statusCode).toBe(401);
    expect((await call("Bearer wrong")).statusCode).toBe(401);
    const ok = await call("Bearer cron-secret-for-tests");
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ok: true });
    await app.close();
  });

  it("isn't there when no cron secret is set", async () => {
    expect((await env.app.inject({ method: "GET", url: "/api/internal/worker" })).statusCode).toBe(404);
  });

  it("runs as production on the center's own servers (APP_ENV), which need a real database and the real EMR", () => {
    const own = { ...base, APP_ENV: "production", EMR_BASE_URL: "https://emr.klinikat.example" };
    expect(() => loadConfig(own)).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...own, EMR_BASE_URL: "", MOCK_EMR_URL: "http://mock.internal" })).toThrow(/EMR_BASE_URL/);
    const c = loadConfig({ ...own, DATABASE_URL: "postgres://db.internal/vwelfare", API_HOST: "0.0.0.0" });
    expect(c.production).toBe(true);
    expect(c.API_HOST).toBe("0.0.0.0");
    expect(loadConfig(base).API_HOST).toBe("127.0.0.1");
  });
});

describe("container build", () => {
  it("sends the same security headers as vercel.json", () => {
    const root = new URL("../../../", import.meta.url);
    const vercel = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8")) as { headers: Array<{ headers: Array<{ key: string; value: string }> }> };
    const nginx = readFileSync(new URL("deploy/nginx.conf", root), "utf8");
    for (const h of vercel.headers.flatMap(x => x.headers)) expect(nginx).toContain(`add_header ${h.key} "${h.value}" always;`);
  });
});
