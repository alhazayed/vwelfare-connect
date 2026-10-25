// New passwords: 12 characters minimum and the leaked-password check (Have I Been Pwned range API).
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hibpCheck } from "../src/lib/passwords.ts";
import { breachCheck, Client, inviteToken, PASSWORD, setup } from "./helpers.ts";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => { env = await setup(); breachCheck.unreachable = false; });
afterEach(async () => { await env.teardown(); });

async function newProviderInvite() {
  await env.createStaff("admin", "admin@vwelfare.test");
  const admin = await env.staffClient("admin@vwelfare.test");
  await admin.ok("POST", "/api/admin/providers", { nameEn: "Dr. New", specialtyEn: "Psychiatrist", email: "new@vwelfare.test", emrStaffId: "ST-9999" });
  return { admin, token: inviteToken(env.notifier.sent.find(s => s.to === "new@vwelfare.test")!.text) };
}

describe("new passwords", () => {
  it("need at least 12 characters and must not be a leaked password; the invitation stays usable after a refusal", async () => {
    const { token } = await newProviderInvite();
    const anon = new Client(env.app);
    const short = await anon.req("POST", "/api/auth/staff/accept-invite", { token, password: "elevenchars" });
    expect(short.statusCode).toBe(400);
    expect(short.json()).toMatchObject({ code: "invalid_input", field: "password" });
    const leaked = await anon.req("POST", "/api/auth/staff/accept-invite", { token, password: "password1234" });
    expect(leaked.statusCode).toBe(400);
    expect(leaked.json().code).toBe("password_breached");
    await anon.ok("POST", "/api/auth/staff/accept-invite", { token, password: PASSWORD });
  });

  it("checks patients' passwords too", async () => {
    await env.createStaff("provider", "sara@vwelfare.test");
    const sara = await env.staffClient("sara@vwelfare.test");
    await sara.ok("POST", "/api/provider/patients", { fileNumber: "10633", mobile: "+000 0000 1234" });
    const token = inviteToken(env.notifier.sent.filter(s => s.channel === "sms").at(-1)!.text);
    const anon = new Client(env.app);
    const res = await anon.req("POST", "/api/auth/patient/accept-invite", { token, username: "mariam.s", password: "qwertyuiop123", acceptTerms: true });
    expect(res.json().code).toBe("password_breached");
    await anon.ok("POST", "/api/auth/patient/accept-invite", { token, username: "mariam.s", password: PASSWORD, acceptTerms: true });
  });

  it("accepts a long enough password when the breach service can't be reached, so set-up never gets stuck", async () => {
    const { token } = await newProviderInvite();
    breachCheck.unreachable = true;
    await new Client(env.app).ok("POST", "/api/auth/staff/accept-invite", { token, password: "password1234" });
  });

  it("applies to the secrets password", async () => {
    const { admin } = await newProviderInvite();
    expect((await admin.req("POST", "/api/admin/vault/setup", { password: "qwertyuiop123" })).json().code).toBe("password_breached");
  });
});

describe("Have I Been Pwned range check", () => {
  let server: Server | null = null;
  afterEach(async () => { if (server) await new Promise(r => server!.close(r)); server = null; });
  const listen = (handler: Parameters<typeof createServer>[1]) => new Promise<string>(resolve => {
    server = createServer(handler!);
    server.listen(0, "127.0.0.1", () => { const a = server!.address(); resolve(`http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`); });
  });
  const sha1 = (s: string) => createHash("sha1").update(s).digest("hex").toUpperCase();

  it("sends only the first 5 hash characters, asks for padding and ignores padding rows", async () => {
    const leaked = sha1("leaked-password-1"), padded = sha1("padding-row-pass");
    const seen: Array<{ url?: string; padding?: string | string[] }> = [];
    const base = await listen((req, res) => {
      seen.push({ url: req.url, padding: req.headers["add-padding"] });
      res.end([`${leaked.slice(5)}:42`, `${padded.slice(5)}:0`, "0000000000000000000000000000000000A:3"].join("\r\n"));
    });
    const check = hibpCheck(base);
    expect(await check("leaked-password-1")).toBe(true);
    expect(await check("padding-row-pass")).toBe(false);
    expect(await check("not-in-the-list-at-all")).toBe(false);
    expect(seen[0]).toEqual({ url: `/range/${leaked.slice(0, 5)}`, padding: "true" });
    expect(seen.every(s => s.url!.length === "/range/".length + 5)).toBe(true);
  });

  it("reports 'couldn't check' on an error, a redirect or a slow reply", async () => {
    let mode = "error";
    const base = await listen((_req, res) => {
      if (mode === "error") return res.writeHead(503).end();
      if (mode === "redirect") return res.writeHead(302, { location: "http://example.com/" }).end();
      setTimeout(() => res.end(""), 500);
    });
    const check = hibpCheck(base, 100);
    expect(await check("x")).toBeNull();
    mode = "redirect";
    expect(await check("x")).toBeNull();
    mode = "slow";
    expect(await check("x")).toBeNull();
  });
});
