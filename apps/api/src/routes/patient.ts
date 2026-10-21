import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { attachments, chatSessions, consents, providerPatients, staff } from "../db/schema.ts";
import { HttpError, type Deps } from "../deps.ts";
import { requirePatient } from "../auth.ts";
import { audit } from "../services/audit.ts";
import { getRules } from "../services/rules.ts";
import { addMessage, findSession, sessionView, startSession } from "../services/chat.ts";
import { isWithinWorkingHours } from "../lib/time.ts";
import { staffKey } from "../realtime.ts";
import { readUpload, recordView, sendProtectedFile } from "./util.ts";

export function patientRoutes(app: FastifyInstance, deps: Deps) {
  const actor = (file: string, ip: string) => ({ type: "patient" as const, id: file, ip });

  async function teamOf(file: string) {
    const links = await deps.db.select({ id: providerPatients.providerId }).from(providerPatients).where(eq(providerPatients.fileNumber, file));
    if (!links.length) return [];
    return deps.db.select().from(staff).where(and(inArray(staff.id, links.map(l => l.id)), eq(staff.active, true)));
  }

  async function requireTeamMember(file: string, providerId: string) {
    const p = (await teamOf(file)).find(x => x.id === providerId);
    if (!p) throw new HttpError(404, "not_your_provider");
    return p;
  }

  app.get("/api/patient/me", async req => {
    const me = requirePatient(req);
    const [name, team, rules, cons, sessions] = await Promise.all([
      deps.emr.getPatientName(me.fileNumber).catch(() => null),
      teamOf(me.fileNumber),
      getRules(deps),
      deps.db.select().from(consents).where(eq(consents.fileNumber, me.fileNumber)),
      deps.db.select().from(chatSessions).where(and(eq(chatSessions.fileNumber, me.fileNumber), eq(chatSessions.status, "open")))
    ]);
    return {
      fileNumber: me.fileNumber,
      username: me.username,
      name,
      afterHours: !isWithinWorkingHours(deps.now(), rules.workingHours, deps.config.CENTER_TIMEZONE),
      help: { emergencyNumber: rules.emergencyNumber, crisisLineNumber: rules.crisisLineNumber },
      team: team.map(p => ({
        id: p.id, name: { en: p.nameEn, ar: p.nameAr }, specialty: { en: p.specialtyEn, ar: p.specialtyAr },
        openChat: sessions.some(s => s.providerId === p.id)
      })),
      consents: cons.filter(c => team.some(p => p.id === c.providerId)).map(c => ({ providerId: c.providerId, status: c.status }))
    };
  });

  app.get<{ Params: { pid: string } }>("/api/patient/providers/:pid/chat", async req => {
    const me = requirePatient(req);
    await requireTeamMember(me.fileNumber, req.params.pid);
    const open = await findSession(deps, me.fileNumber, req.params.pid, "open");
    return { open: open ? await sessionView(deps, open) : null };
  });

  async function openOrStart(file: string, pid: string, ip: string) {
    await requireTeamMember(file, pid);
    return (await findSession(deps, file, pid, "open")) ?? startSession(deps, file, pid, "patient", actor(file, ip));
  }

  app.post<{ Params: { pid: string } }>("/api/patient/providers/:pid/chat/messages", async req => {
    const me = requirePatient(req);
    const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body);
    const s = await openOrStart(me.fileNumber, req.params.pid, req.ip);
    await addMessage(deps, s, "patient", { text });
    return sessionView(deps, s);
  });

  app.post<{ Params: { pid: string } }>("/api/patient/providers/:pid/chat/files", async req => {
    const me = requirePatient(req);
    const file = await readUpload(deps, req);
    const s = await openOrStart(me.fileNumber, req.params.pid, req.ip);
    await addMessage(deps, s, "patient", { file });
    return sessionView(deps, s);
  });

  app.get<{ Params: { pid: string } }>("/api/patient/providers/:pid/records", async req => {
    const me = requirePatient(req);
    const p = await requireTeamMember(me.fileNumber, req.params.pid);
    if (!p.emrStaffId) return [];
    return deps.emr.listChatRecords(me.fileNumber, p.emrStaffId);
  });

  async function ownRecord(file: string, recordId: string) {
    const r = await deps.emr.getChatRecord(recordId);
    if (!r || r.fileNumber !== file) throw new HttpError(404, "not_found");
    return r;
  }

  app.get<{ Params: { recordId: string } }>("/api/patient/records/:recordId", async req => {
    const me = requirePatient(req);
    const r = await ownRecord(me.fileNumber, req.params.recordId);
    const t = await deps.db.query.staff.findFirst({ where: eq(staff.emrStaffId, r.provider.staffId) });
    await audit(deps, actor(me.fileNumber, req.ip), "record_viewed", r.recordName);
    return recordView(r, t ? { en: t.nameEn, ar: t.nameAr } : null);
  });

  app.get<{ Params: { recordId: string; attId: string } }>("/api/patient/records/:recordId/attachments/:attId", async (req, reply) => {
    const me = requirePatient(req);
    await ownRecord(me.fileNumber, req.params.recordId);
    const a = await deps.emr.getAttachment(req.params.recordId, req.params.attId);
    if (!a) throw new HttpError(404, "not_found");
    return sendProtectedFile(reply, a.mimeType, a.content);
  });

  app.post<{ Params: { pid: string } }>("/api/patient/consents/:pid", async req => {
    const me = requirePatient(req);
    const { answer } = z.object({ answer: z.enum(["granted", "denied"]) }).parse(req.body);
    const c = await deps.db.query.consents.findFirst({ where: and(eq(consents.fileNumber, me.fileNumber), eq(consents.providerId, req.params.pid)) });
    if (!c || c.status !== "pending") throw new HttpError(409, "no_pending_request");
    await deps.db.update(consents).set({ status: answer, decidedAt: deps.now() }).where(eq(consents.id, c.id));
    await audit(deps, actor(me.fileNumber, req.ip), answer === "granted" ? "consent_granted" : "consent_declined", req.params.pid);
    deps.hub.publish([staffKey(req.params.pid)], { type: "consent", fileNumber: me.fileNumber });
    return { status: answer };
  });

  app.delete<{ Params: { pid: string } }>("/api/patient/consents/:pid", async req => {
    const me = requirePatient(req);
    await deps.db.update(consents).set({ status: "withdrawn", decidedAt: deps.now() })
      .where(and(eq(consents.fileNumber, me.fileNumber), eq(consents.providerId, req.params.pid), eq(consents.status, "granted")));
    await audit(deps, actor(me.fileNumber, req.ip), "consent_withdrawn", req.params.pid);
    deps.hub.publish([staffKey(req.params.pid)], { type: "consent", fileNumber: me.fileNumber });
    return { status: "withdrawn" };
  });

  // Files in an open chat, for either person in that chat.
  app.get<{ Params: { id: string } }>("/api/chat-files/:id", async (req, reply) => {
    const a = await deps.db.query.attachments.findFirst({ where: eq(attachments.id, req.params.id) });
    if (!a) throw new HttpError(404, "not_found");
    const s = await deps.db.query.chatSessions.findFirst({ where: eq(chatSessions.id, a.sessionId) });
    const auth = req.auth;
    const allowed = !!s && !!auth && (
      (auth.kind === "patient" && auth.patient.fileNumber === s.fileNumber) ||
      (auth.kind === "staff" && auth.mfaOk && auth.staff.id === s.providerId)
    );
    if (!allowed) throw new HttpError(404, "not_found");
    return sendProtectedFile(reply, a.mimeType, await deps.files.get(a.storageKey));
  });
}
