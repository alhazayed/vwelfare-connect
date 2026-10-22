import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { setup } from "./helpers.ts";

const key = randomBytes(32).toString("base64");
const base = { FIELD_ENCRYPTION_KEY: key, DATABASE_URL: "", EMR_BASE_URL: "", MOCK_EMR_URL: "", CRON_SECRET: "", VERCEL: "", VERCEL_ENV: "", TRUST_PROXY: "" };

describe("Vercel configuration", () => {
  it("uses the bound mock EMR outside production only", () => {
    expect(loadConfig({ ...base, MOCK_EMR_URL: "http://mock.internal" }).EMR_BASE_URL).toBe("http://mock.internal");
    expect(loadConfig({ ...base, MOCK_EMR_URL: "http://mock.internal", EMR_BASE_URL: "https://emr.example" }).EMR_BASE_URL).toBe("https://emr.example");
    expect(() => loadConfig({ ...base, VERCEL_ENV: "production", MOCK_EMR_URL: "http://mock.internal" })).toThrow(/EMR_BASE_URL/);
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
});
