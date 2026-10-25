import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog, chatSessions, messages, secrets } from "../src/db/schema.ts";
import { workerTick } from "../src/services/chat.ts";
import { blockedIp, probeHttp } from "../src/lib/probe.ts";
import { ConsoleNotifier, ResendNotifier } from "../src/lib/notify.ts";
import { Client, inviteToken, PASSWORD, setup } from "./helpers.ts";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;
const VAULT_PW = "a-separate-vault-passphrase";

beforeEach(async () => { env = await setup(); });
afterEach(async () => { await env.teardown(); });

async function admin() {
  await env.createStaff("admin", "admin@vwelfare.test");
  const a = await env.staffClient("admin@vwelfare.test");
  await a.ok("POST", "/api/admin/vault/setup", { password: VAULT_PW });
  return a;
}

async function chatWithPatient() {
  await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
  const sara = await env.staffClient("sara@vwelfare.test");
  await sara.ok("POST", "/api/provider/patients", { fileNumber: "10790", mobile: "+000 0000 1234" });
  const sms = env.notifier.sent.filter(s => s.channel === "sms").at(-1)!;
  const patient = new Client(env.app);
  await patient.ok("POST", "/api/auth/patient/accept-invite", { token: inviteToken(sms.text), username: "khaled.i", password: PASSWORD, acceptTerms: true });
  const pid = (await patient.ok("GET", "/api/patient/me")).team[0].id;
  await patient.ok("POST", `/api/patient/providers/${pid}/chat/messages`, { text: "Can we move my appointment?" });
  return { sara, patient };
}

describe("services", () => {
  it("lists every service behind the secrets password, and only for admins", async () => {
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    expect((await (await env.staffClient("sara@vwelfare.test")).req("GET", "/api/admin/services")).statusCode).toBe(403);
    const a = await admin();
    const list = await a.ok<any[]>("GET", "/api/admin/services");
    expect(list.map(s => s.id)).toEqual(["emr", "sms", "email", "scanner"]);
    expect(list.every(s => s.enabled)).toBe(true);
    expect(list.find(s => s.id === "emr")).toMatchObject({ connected: true, waiting: 0 });
    await a.ok("POST", "/api/admin/vault/lock");
    expect((await a.req("GET", "/api/admin/services")).statusCode).toBe(403);
  });

  it("turning the EMR off sends nothing and loses no chat; turning it on sends each waiting chat once", async () => {
    const a = await admin();
    await env.createStaff("admin", "second-admin@vwelfare.test");
    const { sara } = await chatWithPatient();
    const before = env.emr.records.length;

    await a.ok("POST", "/api/admin/services/emr/enabled", { enabled: false });
    const mails = env.notifier.sent.filter(m => m.channel === "email");
    expect(mails.map(m => m.to).sort()).toEqual(["admin@vwelfare.test", "second-admin@vwelfare.test"]);
    expect(mails[0]!.text).toContain("turned off");

    // Lookups say why they fail; finishing a chat locks it and keeps it on the platform.
    const lookup = await sara.req("POST", "/api/provider/lookup", { fileNumber: "10633" });
    expect(lookup.statusCode).toBe(503);
    expect(lookup.json().code).toBe("emr_off");
    expect((await sara.ok("POST", "/api/provider/patients/10790/chat/finish")).status).toBe("queued");
    const [locked] = await env.deps.db.select().from(chatSessions);
    expect(locked).toMatchObject({ status: "locked", lastError: "emr_off", syncAttempts: 0 });
    expect((await a.ok<any[]>("GET", "/api/admin/services")).find(s => s.id === "emr")).toMatchObject({ enabled: false, waiting: 1 });

    // The worker leaves it alone while the EMR is off, however long that is; a locked chat takes no new messages.
    for (let i = 0; i < 3; i++) {
      env.clock.now = new Date(env.clock.now.getTime() + 3 * 3600_000);
      await workerTick(env.deps);
    }
    expect(env.emr.records.length).toBe(before);
    expect((await env.deps.db.select().from(chatSessions))[0]!.status).toBe("locked");
    expect((await env.deps.db.select().from(messages)).length).toBeGreaterThan(0);

    // Hours passed: sign in again. Testing the connection works while it's off, so the admin can check before switching on.
    const a2 = await env.staffClient("admin@vwelfare.test");
    await a2.ok("POST", "/api/admin/vault/unlock", { password: VAULT_PW });
    expect((await a2.ok("POST", "/api/admin/services/emr/test")).ok).toBe(true);

    await a2.ok("POST", "/api/admin/services/emr/enabled", { enabled: true });
    await workerTick(env.deps);
    await workerTick(env.deps);
    expect(env.emr.records.filter(r => r.fileNumber === "10790")).toHaveLength(1);
    expect(await env.deps.db.select().from(chatSessions)).toHaveLength(0);
    expect(await env.deps.db.select().from(messages)).toHaveLength(0);
    expect((await (await env.staffClient("sara@vwelfare.test")).req("POST", "/api/provider/lookup", { fileNumber: "10633" })).statusCode).toBe(200);

    const actions = (await env.deps.db.select().from(auditLog)).map(l => [l.action, l.target]);
    expect(actions).toEqual(expect.arrayContaining([["service_turned_off", "emr"], ["service_turned_on", "emr"]]));
  });

  it("adds, edits, switches off and deletes a service of the admin's own, with its secrets", async () => {
    const a = await admin();
    expect((await a.req("POST", "/api/admin/services", { name: "Pharmacy", address: "https://user:pw@pharmacy.example" })).json().code).toBe("bad_url");
    const { id } = await a.ok<{ id: string }>("POST", "/api/admin/services", { name: "Pharmacy", description: "Prescription partner", address: env.deps.config.EMR_BASE_URL });

    await a.ok("PUT", "/api/admin/secrets/PHARMACY_API_KEY", { value: "ph-key-123456", service: id });
    expect((await a.req("PUT", "/api/admin/secrets/OTHER_KEY", { value: "x", service: "svc_missing" })).json().code).toBe("service_not_found");
    // Editing the secret later keeps it under its service.
    await a.ok("PUT", "/api/admin/secrets/PHARMACY_API_KEY", { value: "ph-key-654321" });
    expect((await a.ok<any[]>("GET", "/api/admin/secrets")).find(s => s.name === "PHARMACY_API_KEY")).toMatchObject({ service: id, value: null });

    await a.ok("PUT", `/api/admin/services/${id}`, { name: "Pharmacy partner", address: env.deps.config.EMR_BASE_URL });
    expect(await a.ok("POST", `/api/admin/services/${id}/test`)).toMatchObject({ ok: true, result: "reachable" });
    await a.ok("POST", `/api/admin/services/${id}/enabled`, { enabled: false });
    expect(await env.deps.secrets.isEnabled(id)).toBe(false);
    expect((await a.ok<any[]>("GET", "/api/admin/services")).find(s => s.id === id)).toMatchObject({ name: "Pharmacy partner", enabled: false, builtIn: false });

    // The app's own services can be switched off but not renamed or deleted.
    expect((await a.req("DELETE", "/api/admin/services/emr")).json().code).toBe("built_in_service");
    expect((await a.req("PUT", "/api/admin/services/sms", { name: "x" })).json().code).toBe("built_in_service");

    await a.ok("DELETE", `/api/admin/services/${id}`);
    expect((await a.ok<any[]>("GET", "/api/admin/services")).some(s => s.id === id)).toBe(false);
    expect(await env.deps.db.select().from(secrets)).toHaveLength(0);
    expect(await env.deps.secrets.isEnabled(id)).toBe(false);

    const log = await env.deps.db.select().from(auditLog);
    expect(log.map(l => l.action)).toEqual(expect.arrayContaining(["service_added", "service_changed", "service_tested", "service_turned_off", "service_deleted"]));
    expect(JSON.stringify(log)).not.toContain("ph-key");
  });

  it("tests SMS and scanner addresses without sending their keys", async () => {
    const a = await admin();
    expect(await a.ok("POST", "/api/admin/services/sms/test")).toMatchObject({ ok: false, result: "not_set" });
    // The test console notifier can't send email, so there's nothing to test yet.
    expect(await a.ok("POST", "/api/admin/services/email/test")).toMatchObject({ ok: false, result: "email_not_set" });

    // Cloud metadata and link-local addresses are never reached; private networks only outside production.
    expect(blockedIp("169.254.169.254", false)).toBe(true);
    expect(blockedIp("10.0.0.5", false)).toBe(false);
    expect(blockedIp("10.0.0.5", true)).toBe(true);
    expect(blockedIp("::ffff:127.0.0.1", true)).toBe(true);
    expect(blockedIp("8.8.8.8", true)).toBe(false);
    expect(await probeHttp("http://169.254.169.254/latest", false)).toMatchObject({ ok: false, result: "blocked_address" });
  });
});

describe("email through Resend", () => {
  type Sent = { auth?: string; body: { from: string; to: string[]; subject: string; text: string } };
  async function fakeResend(status = 200) {
    const sent: Sent[] = [];
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", c => raw += c);
      req.on("end", () => {
        if (req.method === "POST" && req.url === "/emails") sent.push({ auth: req.headers.authorization, body: JSON.parse(raw) });
        res.writeHead(status, { "content-type": "application/json" }).end(status === 200 ? '{"id":"e-1"}' : '{"message":"invalid"}');
      });
    });
    await new Promise<void>(r => server.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    return { sent, base, close: () => new Promise(r => server.close(r)) };
  }
  function useResend(base: string) {
    const fallback = new ConsoleNotifier(() => {});
    const logs: string[] = [];
    env.deps.notifier = new ResendNotifier(fallback, async () => ({
      enabled: await env.deps.secrets.isEnabled("email"),
      apiKey: await env.deps.secrets.get("RESEND_API_KEY"),
      from: await env.deps.secrets.get("EMAIL_FROM")
    }), l => logs.push(l), base);
    return { fallback, logs };
  }

  it("sends once the key and send-from address are saved; prints instead while it's off or not set up", async () => {
    const r = await fakeResend();
    try {
      const a = await admin();
      const { fallback } = useResend(r.base);
      await env.deps.notifier.email("sara@vwelfare.test", "Subject", "Body");
      expect(r.sent).toHaveLength(0);
      expect(fallback.sent).toHaveLength(1);

      await a.ok("PUT", "/api/admin/secrets/RESEND_API_KEY", { value: "re_test_key" });
      await a.ok("PUT", "/api/admin/secrets/EMAIL_FROM", { value: "Vwelfare Connect <no-reply@vwelfare.example>" });
      expect(await a.ok("POST", "/api/admin/services/email/test")).toMatchObject({ ok: true, result: "email_sent" });
      expect(r.sent[0]).toMatchObject({ auth: "Bearer re_test_key", body: { to: ["admin@vwelfare.test"], from: "Vwelfare Connect <no-reply@vwelfare.example>" } });

      await env.deps.notifier.email("sara@vwelfare.test", "Subject", "Body");
      expect(r.sent.at(-1)!.body).toMatchObject({ to: ["sara@vwelfare.test"], subject: "Subject", text: "Body" });

      await a.ok("POST", "/api/admin/services/email/enabled", { enabled: false });
      const before = r.sent.length;
      await env.deps.notifier.email("sara@vwelfare.test", "Subject", "Body");
      expect(r.sent).toHaveLength(before);
      expect(fallback.sent).toHaveLength(2);
    } finally { await r.close(); }
  });

  it("logs a refused email without the address or key, and doesn't throw", async () => {
    const r = await fakeResend(403);
    try {
      const a = await admin();
      const { logs } = useResend(r.base);
      await a.ok("PUT", "/api/admin/secrets/RESEND_API_KEY", { value: "re_bad_key" });
      await a.ok("PUT", "/api/admin/secrets/EMAIL_FROM", { value: "no-reply@vwelfare.example" });
      expect(await a.ok("POST", "/api/admin/services/email/test")).toMatchObject({ ok: false, result: "email_failed", status: 403 });
      await env.deps.notifier.email("sara@vwelfare.test", "Subject", "Body");
      expect(logs.join("\n")).toContain("s…@vwelfare.test");
      expect(logs.join("\n")).not.toMatch(/sara@|re_bad_key/);
    } finally { await r.close(); }
  });
});
