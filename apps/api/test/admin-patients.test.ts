// The admin's patient directory and account help: file numbers and states only, never names or full mobile numbers.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chatSessions } from "../src/db/schema.ts";
import { Client, inviteToken, PASSWORD, setup } from "./helpers.ts";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => { env = await setup(); });
afterEach(async () => { await env.teardown(); });

const lastSms = () => env.notifier.sent.filter(s => s.channel === "sms").at(-1)!;

async function start() {
  await env.createStaff("admin", "admin@vwelfare.test");
  await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
  const admin = await env.staffClient("admin@vwelfare.test");
  const sara = await env.staffClient("sara@vwelfare.test");
  return { admin, sara };
}

async function onboard(provider: Client, fileNumber: string, username: string) {
  await provider.ok("POST", "/api/provider/patients", { fileNumber, mobile: "+000 0000 1234" });
  const patient = new Client(env.app);
  await patient.ok("POST", "/api/auth/patient/accept-invite", { token: inviteToken(lastSms().text), username, password: PASSWORD, acceptTerms: true });
  return patient;
}

describe("admin patient directory", () => {
  it("lists patients by file number and state, without names or mobile numbers", async () => {
    const { admin, sara } = await start();
    await onboard(sara, "10633", "mariam.s");
    await sara.ok("POST", "/api/provider/patients", { fileNumber: "10482", mobile: "+000 0000 5678" });

    const res = await admin.req("GET", "/api/admin/patients");
    expect(res.body).not.toMatch(/Mariam|Khaled|Layla|Yousef|1234|5678/);
    const rows = res.json() as any[];
    expect(rows.map(r => [r.fileNumber, r.status, r.team])).toEqual(expect.arrayContaining([["10633", "active", 1], ["10482", "invited", 1]]));
    expect(rows.find(r => r.fileNumber === "10633").lastSignIn).toBeNull(); // created the account, never signed in separately

    const detail = await admin.req("GET", "/api/admin/patients/10482");
    expect(detail.body).not.toMatch(/Khaled|Layla|Yousef|Mariam|0000 5678/);
    expect(detail.json()).toMatchObject({ status: "invited", mobileEnd: "78", team: [{ link: "accepted" }] });

    // Providers can't use it.
    expect((await sara.req("GET", "/api/admin/patients")).statusCode).toBe(403);
    expect((await admin.req("GET", "/api/admin/patients/abc")).statusCode).toBe(404);
  });

  it("sends a new invitation that replaces the old link, to a corrected mobile if given", async () => {
    const { admin, sara } = await start();
    await sara.ok("POST", "/api/provider/patients", { fileNumber: "10482", mobile: "+000 0000 5678" });
    const oldToken = inviteToken(lastSms().text);

    await admin.ok("POST", "/api/admin/patients/10482/resend-invite", { mobile: "+000 0000 9999" });
    const sms = lastSms();
    expect(sms.to).toBe("+00000009999");
    const anon = new Client(env.app);
    expect((await anon.req("POST", "/api/auth/invite/patient", { token: oldToken })).statusCode).toBe(410);
    await anon.ok("POST", "/api/auth/patient/accept-invite", { token: inviteToken(sms.text), username: "khaled.r", password: PASSWORD, acceptTerms: true });

    // Once the account exists there is nothing to resend.
    expect((await admin.req("POST", "/api/admin/patients/10482/resend-invite", {})).json().code).toBe("already_set_up");
  });

  it("cancels an invitation link", async () => {
    const { admin, sara } = await start();
    await sara.ok("POST", "/api/provider/patients", { fileNumber: "10482", mobile: "+000 0000 5678" });
    const token = inviteToken(lastSms().text);
    await admin.ok("POST", "/api/admin/patients/10482/cancel-invite", {});
    expect((await new Client(env.app).req("POST", "/api/auth/invite/patient", { token })).statusCode).toBe(410);
    expect((await admin.req("POST", "/api/admin/patients/10482/cancel-invite", {})).json().code).toBe("no_open_invite");
  });

  it("unlocks a patient locked by wrong passwords", async () => {
    const { admin, sara } = await start();
    await onboard(sara, "10633", "mariam.s");
    const p = new Client(env.app);
    for (let i = 0; i < 5; i++) await p.req("POST", "/api/auth/patient/login", { username: "mariam.s", password: "wrong-password" });
    expect((await p.req("POST", "/api/auth/patient/login", { username: "mariam.s", password: PASSWORD })).statusCode).toBe(423);
    expect((await admin.ok<any[]>("GET", "/api/admin/patients")).find(r => r.fileNumber === "10633").locked).toBe(true);

    await admin.ok("POST", "/api/admin/patients/10633/unlock", {});
    await p.ok("POST", "/api/auth/patient/login", { username: "mariam.s", password: PASSWORD });
  });

  it("deactivates a patient: signs them out, saves open chats to the EMR, and blocks new chats until reactivated", async () => {
    const { admin, sara } = await start();
    const patient = await onboard(sara, "10633", "mariam.s");
    const pid = (await patient.ok("GET", "/api/patient/me")).team[0].id;
    await patient.ok("POST", `/api/patient/providers/${pid}/chat/messages`, { text: "I'd like to talk about my week." });

    expect((await admin.ok<any[]>("GET", "/api/admin/providers"))[0]).toMatchObject({ patients: 1, openChats: 1 });
    expect((await admin.ok<any[]>("GET", "/api/admin/patients"))[0]).toMatchObject({ team: 1, openChats: 1 });
    const r = await admin.ok("POST", "/api/admin/patients/10633/deactivate", {});
    expect(r).toEqual({ finishedChats: 1, saved: 1 });
    expect(await env.deps.db.select().from(chatSessions)).toEqual([]); // saved and deleted, as after any finish
    expect((await patient.req("GET", "/api/patient/me")).statusCode).toBe(401);
    expect((await new Client(env.app).req("POST", "/api/auth/patient/login", { username: "mariam.s", password: PASSWORD })).statusCode).toBe(401);
    expect((await sara.req("POST", "/api/provider/patients/10633/chat")).json().code).toBe("patient_deactivated");
    expect((await sara.ok<any[]>("GET", "/api/provider/patients"))[0].status).toBe("deactivated");

    expect((await admin.ok("POST", "/api/admin/patients/10633/reactivate", {})).status).toBe("active");
    await new Client(env.app).ok("POST", "/api/auth/patient/login", { username: "mariam.s", password: PASSWORD });

    const actions = (await admin.ok("GET", "/api/admin/patients/10633")).activity.map((a: any) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["patient_deactivated", "patient_reactivated", "chat_saved_to_emr"]));
  });

  it("returns a never-registered patient to invited on reactivation, with the old link no longer working", async () => {
    const { admin, sara } = await start();
    await sara.ok("POST", "/api/provider/patients", { fileNumber: "10482", mobile: "+000 0000 5678" });
    const token = inviteToken(lastSms().text);
    await admin.ok("POST", "/api/admin/patients/10482/deactivate", {});
    expect((await new Client(env.app).req("POST", "/api/auth/invite/patient", { token })).statusCode).toBe(410);
    expect((await admin.ok("POST", "/api/admin/patients/10482/reactivate", {})).status).toBe("invited");
  });

  it("stops another provider adding a deactivated patient", async () => {
    const { admin, sara } = await start();
    await onboard(sara, "10633", "mariam.s");
    await env.createStaff("provider", "omar@vwelfare.test", { emrStaffId: "ST-0200" });
    const omar = await env.staffClient("omar@vwelfare.test");
    await admin.ok("POST", "/api/admin/patients/10633/deactivate", {});
    const before = env.notifier.sent.length;
    expect((await omar.req("POST", "/api/provider/patients", { fileNumber: "10633" })).json().code).toBe("patient_deactivated");
    expect(env.notifier.sent.length).toBe(before);
  });
});

describe("admin provider account help", () => {
  it("resends a provider's set-up link and unlocks a locked provider", async () => {
    await env.createStaff("admin", "admin@vwelfare.test");
    const admin = await env.staffClient("admin@vwelfare.test");
    const { id } = await admin.ok("POST", "/api/admin/providers", { nameEn: "Dr. New", specialtyEn: "Psychiatrist", email: "new@vwelfare.test", emrStaffId: "ST-9999" });
    const first = inviteToken(env.notifier.sent.filter(s => s.to === "new@vwelfare.test").at(-1)!.text);
    await admin.ok("POST", `/api/admin/providers/${id}/resend-invite`, {});
    const second = inviteToken(env.notifier.sent.filter(s => s.to === "new@vwelfare.test").at(-1)!.text);
    const anon = new Client(env.app);
    expect((await anon.req("POST", "/api/auth/invite/staff", { token: first })).statusCode).toBe(410);
    await anon.ok("POST", "/api/auth/staff/accept-invite", { token: second, password: PASSWORD });
    expect((await admin.req("POST", `/api/admin/providers/${id}/resend-invite`, {})).json().code).toBe("already_set_up");

    for (let i = 0; i < 5; i++) await anon.req("POST", "/api/auth/staff/login", { email: "new@vwelfare.test", password: "wrong-password" });
    expect((await admin.ok<any[]>("GET", "/api/admin/providers")).find(p => p.id === id).locked).toBe(true);
    await admin.ok("POST", `/api/admin/providers/${id}/unlock`, {});
    expect((await admin.ok<any[]>("GET", "/api/admin/providers")).find(p => p.id === id).locked).toBe(false);
    expect((await anon.ok("POST", "/api/auth/staff/login", { email: "new@vwelfare.test", password: PASSWORD })).next).toBe("mfa-setup");
  });
});

describe("admin provider profiles", () => {
  it("edits a provider's details and records only which fields changed", async () => {
    const { admin } = await start();
    const sara = (await admin.ok<any[]>("GET", "/api/admin/providers"))[0];
    await admin.ok("PUT", `/api/admin/providers/${sara.id}`, { nameEn: "Dr. Sara A.", specialtyEn: "Psychiatrist", email: "sara.a@vwelfare.test", emrStaffId: "ST-0193" });
    expect((await admin.ok<any[]>("GET", "/api/admin/providers"))[0]).toMatchObject({ nameEn: "Dr. Sara A.", email: "sara.a@vwelfare.test" });
    expect(env.notifier.sent.at(-1)).toMatchObject({ channel: "email", to: "sara@vwelfare.test" }); // the old address hears about it
    const log = await admin.ok<any[]>("GET", "/api/admin/audit?q=provider_changed");
    expect(JSON.stringify(log)).not.toMatch(/sara\.a@/);
    await env.createStaff("provider", "omar@vwelfare.test");
    expect((await admin.req("PUT", `/api/admin/providers/${sara.id}`, { nameEn: "Dr. Sara A.", specialtyEn: "Psychiatrist", email: "omar@vwelfare.test", emrStaffId: "ST-0193" })).json().code).toBe("email_taken");
  });

  it("resets a provider's sign-in: old password and sessions stop working, a new set-up link works", async () => {
    const { admin, sara } = await start();
    const id = (await admin.ok<any[]>("GET", "/api/admin/providers"))[0].id;
    await admin.ok("POST", `/api/admin/providers/${id}/reset-sign-in`, {});
    expect((await sara.req("GET", "/api/provider/patients")).statusCode).toBe(401);
    expect((await new Client(env.app).req("POST", "/api/auth/staff/login", { email: "sara@vwelfare.test", password: PASSWORD })).statusCode).toBe(401);
    const token = inviteToken(env.notifier.sent.filter(s => s.to === "sara@vwelfare.test").at(-1)!.text);
    const anon = new Client(env.app);
    await anon.ok("POST", "/api/auth/staff/accept-invite", { token, password: "a-brand-new-password" });
    expect((await anon.ok("POST", "/api/auth/staff/login", { email: "sara@vwelfare.test", password: "a-brand-new-password" })).next).toBe("mfa-setup");
  });

  it("hands a provider's patients to another provider, who joins only after each patient accepts", async () => {
    const { admin, sara } = await start();
    const patient = await onboard(sara, "10633", "mariam.s");
    await sara.ok("POST", "/api/provider/patients", { fileNumber: "10482", mobile: "+000 0000 5678" });
    const omarRow = await env.createStaff("provider", "omar@vwelfare.test", { emrStaffId: "ST-0200" });
    const omar = await env.staffClient("omar@vwelfare.test");
    const saraId = (await admin.ok<any[]>("GET", "/api/admin/providers")).find(p => p.email === "sara@vwelfare.test").id;

    const r = await admin.ok("POST", `/api/admin/providers/${saraId}/handover`, { toProviderId: omarRow.id });
    expect(r).toEqual({ requested: 2, already: 0, skipped: 0 });
    expect((await omar.req("GET", "/api/provider/patients/10633")).statusCode).toBe(404); // not until the patient accepts
    await patient.ok("POST", `/api/patient/team-requests/${omarRow.id}`, { answer: "accepted" });
    expect((await omar.req("GET", "/api/provider/patients/10633")).statusCode).toBe(200);

    // Running it again changes nothing for patients already linked or waiting.
    expect(await admin.ok("POST", `/api/admin/providers/${saraId}/handover`, { toProviderId: omarRow.id })).toEqual({ requested: 0, already: 2, skipped: 0 });
    expect((await admin.req("POST", `/api/admin/providers/${saraId}/handover`, { toProviderId: saraId })).json().code).toBe("bad_handover");

    // The admin can cancel the request the never-registered patient can't answer yet.
    await admin.ok("DELETE", `/api/admin/providers/${omarRow.id}/patients/10482`);
    expect((await admin.ok<any[]>("GET", `/api/admin/providers/${omarRow.id}/patients`)).map(x => x.fileNumber)).toEqual(["10633"]);
    expect((await admin.req("DELETE", `/api/admin/providers/${omarRow.id}/patients/10482`)).json().code).toBe("no_pending_request");
  });
});

describe("admin needs-attention list and activity", () => {
  it("lists expired invitations, locked accounts, patients without a provider and old unanswered requests", async () => {
    const { admin, sara } = await start();
    await onboard(sara, "10633", "mariam.s");
    await sara.ok("POST", "/api/provider/patients", { fileNumber: "10482", mobile: "+000 0000 5678" });
    const omarRow = await env.createStaff("provider", "omar@vwelfare.test", { emrStaffId: "ST-0200" });
    const omar = await env.staffClient("omar@vwelfare.test");
    await omar.ok("POST", "/api/provider/patients", { fileNumber: "10633" }); // waits for the patient
    expect(await admin.ok("GET", "/api/admin/attention")).toMatchObject({
      invitesExpired: [], lockedPatients: [], noProvider: [], unansweredRequests: [], stuckChats: []
    });

    env.clock.now = new Date(env.clock.now.getTime() + 8 * 86_400_000);
    const p = new Client(env.app);
    for (let i = 0; i < 5; i++) await p.req("POST", "/api/auth/patient/login", { username: "mariam.s", password: "wrong-password" });
    const sid = (await env.deps.db.query.staff.findFirst({ where: (s, { eq }) => eq(s.email, "sara@vwelfare.test") }))!.id;
    const admin2 = await env.staffClient("admin@vwelfare.test"); // the first session timed out while the clock moved
    await admin2.ok("POST", `/api/admin/providers/${sid}/deactivate`, {});

    const a = await admin2.ok("GET", "/api/admin/attention");
    expect(a.invitesExpired).toEqual(["10482"]);
    expect(a.lockedPatients).toEqual(["10633"]);
    expect(a.noProvider).toEqual(["10482", "10633"]); // Sara is deactivated and Omar not yet accepted
    expect(a.unansweredRequests).toEqual([expect.objectContaining({ fileNumber: "10633", providerId: omarRow.id })]);
    expect(JSON.stringify(a)).not.toMatch(/Mariam|Khaled|1234|5678/);
  });

  it("shows a provider's activity and filters the activity log by day", async () => {
    const { admin, sara } = await start();
    await onboard(sara, "10633", "mariam.s");
    const sid = (await admin.ok<any[]>("GET", "/api/admin/providers"))[0].id;
    const acts = (await admin.ok<any[]>("GET", `/api/admin/providers/${sid}/activity`)).map(a => a.action);
    expect(acts).toContain("patient_created_and_invited");

    expect((await admin.ok<any[]>("GET", "/api/admin/audit?from=2026-10-21&to=2026-10-21")).length).toBeGreaterThan(0);
    expect(await admin.ok<any[]>("GET", "/api/admin/audit?from=2026-10-22")).toEqual([]);
    expect(await admin.ok<any[]>("GET", "/api/admin/audit?to=2026-10-20")).toEqual([]);
  });
});

describe("admin reports", () => {
  it("counts invitations, chats, reply times and refusals without any content, and exports them as CSV", async () => {
    const { admin, sara } = await start();
    const patient = await onboard(sara, "10633", "mariam.s");
    const pid = (await patient.ok("GET", "/api/patient/me")).team[0].id;
    await patient.ok("POST", `/api/patient/providers/${pid}/chat/messages`, { text: "I can't sleep and I want to die." });
    env.clock.now = new Date(env.clock.now.getTime() + 12 * 60_000); // inside the 15-minute staff idle limit
    await sara.ok("POST", "/api/provider/patients/10633/chat/messages", { text: "Thank you for telling me. Let's talk." });
    await sara.ok("POST", "/api/provider/patients/10633/chat/finish");

    const admin2 = await env.staffClient("admin@vwelfare.test"); // the first session timed out while the clock moved
    const r = await admin2.ok("GET", "/api/admin/reports");
    expect(r.totals).toMatchObject({
      invitationsSent: 1, accountsCreated: 1, chatsStartedByPatients: 1, chatsSaved: 1,
      firstReplyMedianMinutes: 12, riskFlags: 1, emrRefusals: 0
    });
    expect(r.patients).toEqual({ invited: 0, active: 1, deactivated: 0 });
    expect(r.providers[0]).toMatchObject({ patients: 1, openChats: 0, chatsSaved: 1, firstReplyMedianMinutes: 12 });
    expect(r.weeks).toEqual([{ week: "2026-10-19", started: 1, saved: 1 }]);

    // Outside the range there is nothing.
    expect((await admin2.ok("GET", "/api/admin/reports?from=2026-10-22&to=2026-10-30")).totals.chatsSaved).toBe(0);

    const csv = await admin2.req("GET", "/api/admin/reports.csv?from=2026-10-01&to=2026-10-31");
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.headers["content-disposition"]).toMatch(/vwelfare-report-2026-10-01-to-2026-10-31\.csv/);
    expect(csv.body).toMatch(/"chatsSaved","1"/);
    expect(csv.body).not.toMatch(/sleep|want to die|Mariam|10633|1234/); // no content, no patient details
    expect((await admin2.ok<any[]>("GET", "/api/admin/audit?q=report_exported")).length).toBe(1);
    expect((await sara.req("GET", "/api/admin/reports")).statusCode).toBe(403);
  });
});
