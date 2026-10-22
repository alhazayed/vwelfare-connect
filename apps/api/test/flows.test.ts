import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import { attachments, chatSessions, messages } from "../src/db/schema.ts";
import { addMessage, finishSession, workerTick } from "../src/services/chat.ts";
import { Client, inviteToken, PASSWORD, setup } from "./helpers.ts";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => { env = await setup(); });
afterEach(async () => { await env.teardown(); });

async function onboardPatient(provider: Client, fileNumber: string, username: string) {
  await provider.ok("POST", "/api/provider/patients", { fileNumber, mobile: "+000 0000 1234" });
  const sms = env.notifier.sent.filter(s => s.channel === "sms").at(-1)!;
  expect(sms.text).not.toMatch(/Mariam|Khaled|Layla|Yousef/); // no names in notifications
  const patient = new Client(env.app);
  await patient.ok("POST", "/api/auth/patient/accept-invite", { token: inviteToken(sms.text), username, password: PASSWORD, acceptTerms: true });
  return patient;
}

describe("staff accounts", () => {
  it("admin creates a provider who sets a password and an authenticator app", async () => {
    await env.createStaff("admin", "admin@vwelfare.test");
    const admin = await env.staffClient("admin@vwelfare.test");
    await admin.ok("POST", "/api/admin/providers", { nameEn: "Dr. New", specialtyEn: "Psychiatrist", email: "new@vwelfare.test", emrStaffId: "ST-9999" });
    const email = env.notifier.sent.find(s => s.channel === "email" && s.to === "new@vwelfare.test")!;
    await new Client(env.app).ok("POST", "/api/auth/staff/accept-invite", { token: inviteToken(email.text), password: PASSWORD });

    const p = new Client(env.app);
    expect((await p.ok("POST", "/api/auth/staff/login", { email: "new@vwelfare.test", password: PASSWORD })).next).toBe("mfa-setup");
    expect((await p.req("GET", "/api/provider/patients")).statusCode).toBe(401); // not usable before MFA
    const { secret } = await p.ok("GET", "/api/auth/staff/mfa-setup");
    await p.ok("POST", "/api/auth/staff/mfa", { code: authenticator.generate(secret) });
    expect((await p.req("GET", "/api/provider/patients")).statusCode).toBe(200);
  });

  it("rejects requests without the app header", async () => {
    const res = await env.app.inject({ method: "POST", url: "/api/auth/patient/login", payload: { username: "x", password: "y" } });
    expect(res.statusCode).toBe(403);
  });
});

describe("chat lifecycle", () => {
  it("saves a finished chat to the EMR and deletes it from the platform", async () => {
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193", nameEn: "Dr. Sara Al-Mansour" });
    const sara = await env.staffClient("sara@vwelfare.test");
    const lookup = await sara.ok("POST", "/api/provider/lookup", { fileNumber: "10633" });
    expect(lookup.name.en).toBe("Mariam Saleh");
    const patient = await onboardPatient(sara, "10633", "mariam.s");

    const me = await patient.ok("GET", "/api/patient/me");
    const pid = me.team[0].id;
    await patient.ok("POST", `/api/patient/providers/${pid}/chat/messages`, { text: "Hello, I have a question about my sleep." });
    const up = await patient.upload(`/api/patient/providers/${pid}/chat/files`, "sleep-log.pdf", Buffer.from("%PDF-1.4 sleep log"));
    expect(up.statusCode).toBe(200);
    expect((await patient.upload(`/api/patient/providers/${pid}/chat/files`, "virus.exe", Buffer.from("MZ"))).statusCode).toBe(415);

    await sara.ok("POST", "/api/provider/patients/10633/chat/messages", { text: "Thanks, I've read it." });
    const chat = await sara.ok("GET", "/api/provider/patients/10633/chat");
    expect(chat.open.messages.map((m: any) => m.kind)).toEqual(["started", "text", "file", "text"]);
    expect(chat.open.recordName).toBe("10633_2026-10-21_09-00");

    // Stored encrypted, not as plain text.
    const raw = await env.deps.db.select().from(messages);
    expect(raw.some(m => m.textEnc?.includes("sleep"))).toBe(false);

    const result = await sara.ok("POST", "/api/provider/patients/10633/chat/finish");
    expect(result).toMatchObject({ status: "saved", recordName: "10633_2026-10-21_09-00", messageCount: 2, fileCount: 1 });

    const saved = env.emr.records.find(r => r.recordName === "10633_2026-10-21_09-00")!;
    expect(saved.provider.staffId).toBe("ST-0193");
    expect(saved.messages.filter(m => m.text).length).toBe(3); // started + 2 texts
    expect(saved.attachments[0]!.content.toString()).toBe("%PDF-1.4 sleep log");

    // Nothing of the chat remains on the platform.
    expect(await env.deps.db.select().from(chatSessions)).toHaveLength(0);
    expect(await env.deps.db.select().from(messages)).toHaveLength(0);
    expect(await env.deps.db.select().from(attachments)).toHaveLength(0);
    expect(env.files.files.size).toBe(0);

    // A second chat started in the same minute gets its own name.
    await patient.ok("POST", `/api/patient/providers/${pid}/chat/messages`, { text: "One more thing" });
    expect((await sara.ok("GET", "/api/provider/patients/10633/chat")).open.recordName).toBe("10633_2026-10-21_09-00_2");

    // Both can read it back from the EMR.
    const mine = await sara.ok("GET", "/api/provider/patients/10633/records");
    expect(mine.mine).toHaveLength(1);
    const rec = await patient.ok("GET", `/api/patient/records/${mine.mine[0].recordId}`);
    expect(rec.recordName).toBe("10633_2026-10-21_09-00");
  });

  it("keeps a finished chat locked while the EMR is down, then sends it once", async () => {
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    const sara = await env.staffClient("sara@vwelfare.test");
    const patient = await onboardPatient(sara, "10790", "khaled.i");
    const pid = (await patient.ok("GET", "/api/patient/me")).team[0].id;
    await patient.ok("POST", `/api/patient/providers/${pid}/chat/messages`, { text: "Can we move my appointment?" });

    env.emr.state.outage = true;
    expect((await sara.ok("POST", "/api/provider/patients/10790/chat/finish")).status).toBe("queued");
    expect((await sara.ok("GET", "/api/provider/patients/10790/chat")).waitingForEmr).toBe(true);
    expect((await env.deps.db.select().from(chatSessions))[0]!.status).toBe("locked");

    // A new message from the patient opens a new chat; the locked one is untouched.
    await patient.ok("POST", `/api/patient/providers/${pid}/chat/messages`, { text: "Also, thank you." });
    expect(await env.deps.db.select().from(chatSessions)).toHaveLength(2);

    env.emr.state.outage = false;
    env.clock.now = new Date(env.clock.now.getTime() + 60_000);
    await workerTick(env.deps);
    const left = await env.deps.db.select().from(chatSessions);
    expect(left).toHaveLength(1);
    expect(left[0]!.status).toBe("open");
    expect(env.emr.records.filter(r => r.fileNumber === "10790")).toHaveLength(1);
  });

  it("finishes a chat automatically after 24 hours without messages", async () => {
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    const sara = await env.staffClient("sara@vwelfare.test");
    const patient = await onboardPatient(sara, "10633", "mariam.s");
    const pid = (await patient.ok("GET", "/api/patient/me")).team[0].id;
    await patient.ok("POST", `/api/patient/providers/${pid}/chat/messages`, { text: "Hello" });

    env.clock.now = new Date(env.clock.now.getTime() + 21 * 3600_000);
    await workerTick(env.deps);
    expect(env.notifier.sent.some(s => s.channel === "email" && s.text.includes("open chat"))).toBe(true);

    env.clock.now = new Date(env.clock.now.getTime() + 4 * 3600_000);
    await workerTick(env.deps);
    expect(await env.deps.db.select().from(chatSessions)).toHaveLength(0);
    expect(env.emr.records.find(r => r.fileNumber === "10633")!.finishedBy).toBe("auto");
  });

  it("never loses a message sent while the chat is being finished", async () => {
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    const sara = await env.staffClient("sara@vwelfare.test");
    const patient = await onboardPatient(sara, "10633", "mariam.s");
    const pid = (await patient.ok("GET", "/api/patient/me")).team[0].id;
    await patient.ok("POST", `/api/patient/providers/${pid}/chat/messages`, { text: "First message" });
    // The patient's request read the chat as open just before the provider finished it.
    const [stale] = await env.deps.db.select().from(chatSessions);

    // While the chat is on its way to the EMR, the patient's text and file arrive.
    const emr = env.deps.emr;
    const save = emr.saveChatRecord.bind(emr);
    const late: unknown[] = [];
    emr.saveChatRecord = async (...args) => {
      for (const content of [{ text: "Sent during finish" }, { file: { name: "late.pdf", mimeType: "application/pdf", content: Buffer.from("%PDF late") } }]) {
        late.push(await addMessage(env.deps, stale!, "patient", content).catch(e => (e as { code?: string }).code));
      }
      return save(...args);
    };

    expect((await sara.ok("POST", "/api/provider/patients/10633/chat/finish")).status).toBe("saved");
    expect(late).toEqual(["chat_locked", "chat_locked"]);
    expect(env.files.files.size).toBe(0);
    expect(await env.deps.db.select().from(messages)).toHaveLength(0);
    expect(await env.deps.db.select().from(attachments)).toHaveLength(0);
  });

  it("sends a chat to the EMR once when it is finished twice at the same moment", async () => {
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    const sara = await env.staffClient("sara@vwelfare.test");
    const patient = await onboardPatient(sara, "10633", "mariam.s");
    const pid = (await patient.ok("GET", "/api/patient/me")).team[0].id;
    await patient.ok("POST", `/api/patient/providers/${pid}/chat/messages`, { text: "Hello" });
    const [s] = await env.deps.db.select().from(chatSessions);

    const emr = env.deps.emr;
    const save = emr.saveChatRecord.bind(emr);
    let sends = 0;
    emr.saveChatRecord = async (...args) => { sends++; return save(...args); };

    // The provider's Finish button and the automatic finish, together.
    const results = await Promise.all([
      finishSession(env.deps, s!, "provider", { type: "system" }),
      finishSession(env.deps, s!, "auto", { type: "system" })
    ]);
    expect(sends).toBe(1);
    expect(results[0]!.status).toBe("saved");
    expect(env.emr.records.filter(r => r.fileNumber === "10633")).toHaveLength(1);
  });

  it("flags risk words and replies automatically after hours", async () => {
    env.clock.now = new Date("2026-10-21T22:00:00Z");
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    const sara = await env.staffClient("sara@vwelfare.test");
    const patient = await onboardPatient(sara, "10633", "mariam.s");
    const pid = (await patient.ok("GET", "/api/patient/me")).team[0].id;

    const view = await patient.ok("POST", `/api/patient/providers/${pid}/chat/messages`, { text: "I keep thinking I want to hurt myself" });
    expect(view.risk).toBe(true);
    expect(view.messages.map((m: any) => m.kind)).toContain("afterhours");
    expect((await sara.ok("GET", "/api/provider/patients")).find((p: any) => p.fileNumber === "10633").risk).toBe(true);
    expect(env.notifier.sent.some(s => s.channel === "email" && s.to === "sara@vwelfare.test" && !s.text.includes("hurt"))).toBe(true);
  });
});

describe("consent", () => {
  it("lets a provider read another provider's chats only while the patient allows it", async () => {
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    const sara = await env.staffClient("sara@vwelfare.test");
    const patient = await onboardPatient(sara, "10482", "layla.h");

    const recs = await sara.ok("GET", "/api/provider/patients/10482/records");
    const omars = recs.others[0];
    expect(omars.providerStaffId).toBe("ST-0207");
    expect((await sara.req("GET", `/api/provider/records/${omars.recordId}`)).statusCode).toBe(403);

    await sara.ok("POST", "/api/provider/patients/10482/consent-request");
    const pid = (await patient.ok("GET", "/api/patient/me")).team[0].id;
    await patient.ok("POST", `/api/patient/consents/${pid}`, { answer: "granted" });
    expect((await sara.req("GET", `/api/provider/records/${omars.recordId}`)).statusCode).toBe(200);

    await patient.ok("DELETE", `/api/patient/consents/${pid}`);
    expect((await sara.req("GET", `/api/provider/records/${omars.recordId}`)).statusCode).toBe(403);
  });
});

describe("sign-in protection", () => {
  it("locks a patient account after 5 wrong passwords", async () => {
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    const sara = await env.staffClient("sara@vwelfare.test");
    await onboardPatient(sara, "10633", "mariam.s");
    const c = new Client(env.app);
    for (let i = 0; i < 5; i++) expect((await c.req("POST", "/api/auth/patient/login", { username: "mariam.s", password: "wrong" })).statusCode).toBe(401);
    expect((await c.req("POST", "/api/auth/patient/login", { username: "mariam.s", password: PASSWORD })).statusCode).toBe(423);
  });

  it("deactivating a provider finishes their open chats and signs them out", async () => {
    await env.createStaff("admin", "admin@vwelfare.test");
    const s = await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    const admin = await env.staffClient("admin@vwelfare.test");
    const sara = await env.staffClient("sara@vwelfare.test");
    const patient = await onboardPatient(sara, "10633", "mariam.s");
    const pid = (await patient.ok("GET", "/api/patient/me")).team[0].id;
    await patient.ok("POST", `/api/patient/providers/${pid}/chat/messages`, { text: "Hello" });

    expect(await admin.ok("GET", `/api/admin/providers/${s.id}/impact`)).toEqual({ openChats: 1, patients: 1 });
    expect(await admin.ok("POST", `/api/admin/providers/${s.id}/deactivate`)).toEqual({ finishedChats: 1, saved: 1 });
    expect((await sara.req("GET", "/api/provider/patients")).statusCode).toBe(401);
    expect((await patient.ok("GET", "/api/patient/me")).team).toHaveLength(0);
    expect(env.emr.records.find(r => r.fileNumber === "10633")!.finishedBy).toBe("deactivation");
  });
});
