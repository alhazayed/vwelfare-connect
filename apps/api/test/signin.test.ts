import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import { desc, eq } from "drizzle-orm";
import { auditLog } from "../src/db/schema.ts";
import { Client, PASSWORD, setup } from "./helpers.ts";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => { env = await setup(); });
afterEach(async () => { await env.teardown(); });

const wrongCode = (secret: string) => String((Number(authenticator.generate(secret)) + 1) % 1_000_000).padStart(6, "0");

describe("staff sign-in", () => {
  it("locks the account after 5 wrong authenticator codes, even with the right password each time", async () => {
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    const secret = env.mfaSecrets.get("sara@vwelfare.test")!;
    for (let i = 1; i <= 5; i++) {
      // A new browser each time, as an attacker with the password would use: the count still adds up.
      const c = new Client(env.app);
      expect((await c.req("POST", "/api/auth/staff/login", { email: "sara@vwelfare.test", password: PASSWORD })).statusCode).toBe(200);
      const res = await c.req("POST", "/api/auth/staff/mfa", { code: wrongCode(secret) });
      expect(res.statusCode).toBe(i < 5 ? 401 : 423);
      if (i === 5) expect((await c.req("GET", "/api/provider/patients")).statusCode).toBe(401); // signed out
    }
    const c = new Client(env.app);
    expect((await c.req("POST", "/api/auth/staff/login", { email: "sara@vwelfare.test", password: PASSWORD })).statusCode).toBe(423);

    // After 15 minutes the right password and code work, and the count starts again.
    env.clock.now = new Date(env.clock.now.getTime() + 16 * 60_000);
    await env.staffClient("sara@vwelfare.test");
  });

  it("refuses an authenticator code that was already used", async () => {
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    // Codes change every 30 seconds; don't start in the last few seconds of one.
    const left = 30_000 - (Date.now() % 30_000);
    if (left < 5_000) await new Promise(r => setTimeout(r, left + 100));
    const code = authenticator.generate(env.mfaSecrets.get("sara@vwelfare.test")!);
    const first = new Client(env.app);
    await first.ok("POST", "/api/auth/staff/login", { email: "sara@vwelfare.test", password: PASSWORD });
    await first.ok("POST", "/api/auth/staff/mfa", { code });

    const replay = new Client(env.app);
    await replay.ok("POST", "/api/auth/staff/login", { email: "sara@vwelfare.test", password: PASSWORD });
    const res = await replay.req("POST", "/api/auth/staff/mfa", { code });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("code_used");
    expect((await replay.req("GET", "/api/provider/patients")).statusCode).toBe(401);
  });

  it("takes the client address from X-Forwarded-For only when a trusted proxy sends it", async () => {
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    const attempt = (remoteAddress: string) => env.app.inject({
      method: "POST", url: "/api/auth/staff/login", remoteAddress,
      headers: { "x-vwelfare": "1", "x-forwarded-for": "198.51.100.7" },
      payload: { email: "sara@vwelfare.test", password: "wrong" }
    });
    const lastIp = async () => (await env.deps.db.select().from(auditLog).where(eq(auditLog.action, "sign_in_failed")).orderBy(desc(auditLog.id)).limit(1))[0]!.ip;

    await attempt("203.0.113.9"); // straight from the internet: the header is ignored
    expect(await lastIp()).toBe("203.0.113.9");
    await attempt("127.0.0.1"); // through the proxy on the same machine
    expect(await lastIp()).toBe("198.51.100.7");
  });
});
