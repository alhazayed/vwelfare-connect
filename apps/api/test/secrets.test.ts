import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog, secrets } from "../src/db/schema.ts";
import { PASSWORD, setup } from "./helpers.ts";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;
const VAULT_PW = "a-separate-vault-passphrase";

beforeEach(async () => { env = await setup(); });
afterEach(async () => { await env.teardown(); });

async function admin() {
  await env.createStaff("admin", "admin@vwelfare.test");
  return env.staffClient("admin@vwelfare.test");
}

describe("secrets list", () => {
  it("stays closed until the separate vault password is entered", async () => {
    const a = await admin();
    expect((await a.req("GET", "/api/admin/secrets")).statusCode).toBe(403);
    expect((await a.ok("GET", "/api/admin/vault")).configured).toBe(false);

    // The vault password must differ from the sign-in password and be long enough.
    expect((await a.req("POST", "/api/admin/vault/setup", { password: PASSWORD })).statusCode).toBe(400);
    expect((await a.req("POST", "/api/admin/vault/setup", { password: "short" })).statusCode).toBe(400);
    await a.ok("POST", "/api/admin/vault/setup", { password: VAULT_PW });
    expect((await a.req("GET", "/api/admin/secrets")).statusCode).toBe(200);

    await a.ok("POST", "/api/admin/vault/lock");
    expect((await a.req("GET", "/api/admin/secrets")).statusCode).toBe(403);
    expect((await a.req("POST", "/api/admin/vault/unlock", { password: "wrong-password-here" })).statusCode).toBe(401);
    await a.ok("POST", "/api/admin/vault/unlock", { password: VAULT_PW });
    expect((await a.req("GET", "/api/admin/secrets")).statusCode).toBe(200);

    // Unlocking expires after 10 minutes.
    env.clock.now = new Date(env.clock.now.getTime() + 11 * 60_000);
    const fresh = await env.staffClient("admin@vwelfare.test");
    expect((await fresh.req("GET", "/api/admin/secrets")).statusCode).toBe(403);
  });

  it("locks out after 5 wrong vault passwords", async () => {
    const a = await admin();
    await a.ok("POST", "/api/admin/vault/setup", { password: VAULT_PW });
    await a.ok("POST", "/api/admin/vault/lock");
    for (let i = 0; i < 5; i++) await a.req("POST", "/api/admin/vault/unlock", { password: "wrong-password-here" });
    expect((await a.req("POST", "/api/admin/vault/unlock", { password: VAULT_PW })).statusCode).toBe(423);
  });

  it("is not available to providers", async () => {
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    const p = await env.staffClient("sara@vwelfare.test");
    expect((await p.req("GET", "/api/admin/vault")).statusCode).toBe(403);
    expect((await p.req("GET", "/api/admin/secrets")).statusCode).toBe(403);
  });

  it("hides secret values, reveals them one at a time, and stores them encrypted", async () => {
    const a = await admin();
    await a.ok("POST", "/api/admin/vault/setup", { password: VAULT_PW });
    await a.ok("PUT", "/api/admin/secrets/SMS_API_KEY", { value: "sk-live-123456" });
    await a.ok("PUT", "/api/admin/secrets/PHARMACY_API_TOKEN", { value: "tok-987", description: "Pharmacy partner" });
    expect((await a.req("PUT", "/api/admin/secrets/lowercase_name", { value: "x" })).statusCode).toBe(400);
    expect((await a.req("PUT", "/api/admin/secrets/EMR_BASE_URL", { value: "not a url" })).statusCode).toBe(400);

    const list = await a.ok<any[]>("GET", "/api/admin/secrets");
    const sms = list.find(s => s.name === "SMS_API_KEY");
    expect(sms).toMatchObject({ source: "saved", value: null, isSecret: true, connected: false });
    expect(list.find(s => s.name === "EMR_CLIENT_ID")).toMatchObject({ source: "env", value: "test-client" });
    expect(list.find(s => s.name === "PHARMACY_API_TOKEN")).toMatchObject({ group: "custom", description: "Pharmacy partner", value: null });
    expect(JSON.stringify(list)).not.toContain("sk-live-123456");

    expect((await a.ok("POST", "/api/admin/secrets/SMS_API_KEY/reveal")).value).toBe("sk-live-123456");
    const raw = await env.deps.db.select().from(secrets);
    expect(raw.some(r => r.valueEnc.includes("sk-live"))).toBe(false);

    const log = await env.deps.db.select().from(auditLog);
    expect(log.map(l => l.action)).toEqual(expect.arrayContaining(["vault_password_set", "secret_added", "secret_revealed"]));
    expect(JSON.stringify(log)).not.toContain("sk-live-123456");

    await a.ok("DELETE", "/api/admin/secrets/PHARMACY_API_TOKEN");
    expect((await a.ok<any[]>("GET", "/api/admin/secrets")).some(s => s.name === "PHARMACY_API_TOKEN")).toBe(false);
  });

  it("uses saved EMR credentials straight away, and falls back to .env when cleared", async () => {
    const a = await admin();
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    const sara = await env.staffClient("sara@vwelfare.test");
    await a.ok("POST", "/api/admin/vault/setup", { password: VAULT_PW });
    expect(await a.ok("POST", "/api/admin/secrets/test/emr")).toEqual({ ok: true });

    await a.ok("PUT", "/api/admin/secrets/EMR_CLIENT_SECRET", { value: "wrong-secret" });
    expect((await a.ok("POST", "/api/admin/secrets/test/emr")).ok).toBe(false);
    expect((await sara.req("POST", "/api/provider/lookup", { fileNumber: "10633" })).statusCode).toBe(503);

    await a.ok("DELETE", "/api/admin/secrets/EMR_CLIENT_SECRET");
    expect(await a.ok("POST", "/api/admin/secrets/test/emr")).toEqual({ ok: true });
    expect((await sara.req("POST", "/api/provider/lookup", { fileNumber: "10633" })).statusCode).toBe(200);
  });
});
