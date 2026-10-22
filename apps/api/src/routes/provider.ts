import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, desc, eq, ne } from "drizzle-orm";
import { chatSessions, consents, invitations, messages, patients, providerPatients, staff } from "../db/schema.ts";
import { newToken, sha256 } from "../lib/crypto.ts";
import { HttpError, type Deps } from "../deps.ts";
import { requireStaff } from "../auth.ts";
import { audit } from "../services/audit.ts";
import { getRules } from "../services/rules.ts";
import { addMessage, findSession, finishSession, sessionView, startSession } from "../services/chat.ts";
import { patientKey } from "../realtime.ts";
import { readUpload, recordView, sendProtectedFile } from "./util.ts";

const INVITE_HOURS = 72;
// After a patient declines a care-team request, the same provider can ask again only after this long.
const ASK_AGAIN_DAYS = 7;
const fileNumber = z.string().trim().regex(/^\d{3,12}$/, "Enter a valid file number");

export function providerRoutes(app: FastifyInstance, deps: Deps) {
  const actor = (id: string, ip: string) => ({ type: "provider" as const, id, ip });

  const findLink = (providerId: string, file: string) =>
    deps.db.query.providerPatients.findFirst({ where: and(eq(providerPatients.providerId, providerId), eq(providerPatients.fileNumber, file)) });

  /** Only patients who accepted this provider (or were invited by them) count as theirs. */
  async function requireLinked(providerId: string, file: string) {
    const link = await findLink(providerId, file);
    if (link?.status !== "accepted") throw new HttpError(404, "not_your_patient", "This patient is not in your list");
    const p = await deps.db.query.patients.findFirst({ where: eq(patients.fileNumber, file) });
    return p!;
  }

  app.get("/api/provider/patients", async req => {
    const me = requireStaff(req, "provider");
    const rows = await deps.db.select({ fileNumber: patients.fileNumber, status: patients.status, link: providerPatients.status })
      .from(providerPatients).innerJoin(patients, eq(patients.fileNumber, providerPatients.fileNumber))
      .where(eq(providerPatients.providerId, me.id));
    const sessions = await deps.db.select().from(chatSessions).where(eq(chatSessions.providerId, me.id));
    return Promise.all(rows.map(async r => {
      // Until the patient accepts, the provider sees only the file number and the state of the request.
      if (r.link !== "accepted") return { fileNumber: r.fileNumber, status: r.status, link: r.link, name: null, openChat: false, lastFrom: null, risk: false, waitingForEmr: false };
      const open = sessions.find(s => s.fileNumber === r.fileNumber && s.status === "open");
      const last = open ? await deps.db.query.messages.findFirst({
        where: and(eq(messages.sessionId, open.id), ne(messages.sender, "system")), orderBy: desc(messages.seq)
      }) : undefined;
      const name = await deps.emr.getPatientName(r.fileNumber).catch(() => null);
      return {
        fileNumber: r.fileNumber, status: r.status, link: r.link, name,
        openChat: !!open, lastFrom: last?.sender ?? null, risk: !!open?.risk,
        waitingForEmr: sessions.some(s => s.fileNumber === r.fileNumber && s.status === "locked")
      };
    }));
  });

  // Lookups show a name and visit dates from the EMR for any file number, so each provider gets a limited number.
  const lookupLimit = { config: { rateLimit: {
    max: 30, timeWindow: "1 minute",
    keyGenerator: (req: FastifyRequest) => req.auth?.kind === "staff" ? `lookup:${req.auth.staff.id}` : `lookup:${req.ip}`
  } } };

  app.post("/api/provider/lookup", lookupLimit, async req => {
    const me = requireStaff(req, "provider");
    const { fileNumber: file } = z.object({ fileNumber }).parse(req.body);
    const name = await deps.emr.getPatientName(file);
    if (!name) throw new HttpError(404, "not_in_emr", `No patient with file number ${file} in the EMR`);
    const visits = await deps.emr.getVisits(file);
    const p = await deps.db.query.patients.findFirst({ where: eq(patients.fileNumber, file) });
    const link = p ? await findLink(me.id, file) : undefined;
    await audit(deps, actor(me.id, req.ip), "patient_looked_up", file);
    return { fileNumber: file, name, visits, onPlatform: !!p, mine: link?.status === "accepted", request: link && link.status !== "accepted" ? link.status : null };
  });

  app.post("/api/provider/patients", lookupLimit, async req => {
    const me = requireStaff(req, "provider");
    const body = z.object({ fileNumber, mobile: z.string().optional() }).parse(req.body);
    if (!(await deps.emr.getPatientName(body.fileNumber))) throw new HttpError(404, "not_in_emr", "No patient with that file number in the EMR");
    const existing = await deps.db.query.patients.findFirst({ where: eq(patients.fileNumber, body.fileNumber) });
    if (existing) {
      // The patient decides who joins their care team: the link waits until they accept it in the app.
      const now = deps.now();
      const link = await findLink(me.id, body.fileNumber);
      if (link?.status === "accepted") return { status: "linked" };
      if (link?.status === "pending") return { status: "pending" };
      if (link?.status === "declined" && link.decidedAt && now.getTime() - link.decidedAt.getTime() < ASK_AGAIN_DAYS * 86_400_000) {
        throw new HttpError(409, "link_declined", "The patient declined this request recently. You can ask again 7 days after they declined.");
      }
      await deps.db.insert(providerPatients).values({ providerId: me.id, fileNumber: body.fileNumber, status: "pending", createdAt: now })
        .onConflictDoUpdate({ target: [providerPatients.providerId, providerPatients.fileNumber], set: { status: "pending", createdAt: now, decidedAt: null } });
      if (existing.mobileEnc) await deps.notifier.sms(deps.cipher.decrypt(existing.mobileEnc), "Vwelfare: you have a new request in Vwelfare Connect. Sign in to see it.");
      await audit(deps, actor(me.id, req.ip), "care_team_requested", body.fileNumber);
      deps.hub.publish([patientKey(body.fileNumber)], { type: "team", fileNumber: body.fileNumber });
      return { status: "pending" };
    }
    const digits = (body.mobile ?? "").replace(/[^\d+]/g, "");
    if (digits.replace("+", "").length < 8) throw new HttpError(400, "bad_mobile", "Enter a mobile number with at least 8 digits");
    const token = newToken();
    await deps.db.transaction(async tx => {
      await tx.insert(patients).values({ fileNumber: body.fileNumber, status: "invited", invitedBy: me.id, mobileEnc: deps.cipher.encrypt(digits) });
      await tx.insert(providerPatients).values({ providerId: me.id, fileNumber: body.fileNumber });
      await tx.insert(invitations).values({ kind: "patient", subject: body.fileNumber, tokenHash: sha256(token), expiresAt: new Date(deps.now().getTime() + INVITE_HOURS * 3600_000) });
    });
    await deps.notifier.sms(digits, `Vwelfare: you're invited to message your care team securely. Set up your account (valid ${INVITE_HOURS} hours): ${deps.config.APP_BASE_URL}/invite/patient#${token}`);
    await audit(deps, actor(me.id, req.ip), "patient_created_and_invited", body.fileNumber);
    return { status: "invited" };
  });

  app.get<{ Params: { file: string } }>("/api/provider/patients/:file", async req => {
    const me = requireStaff(req, "provider");
    const p = await requireLinked(me.id, req.params.file);
    const [name, visits] = await Promise.all([deps.emr.getPatientName(p.fileNumber), deps.emr.getVisits(p.fileNumber)]);
    const mobile = p.status === "invited" && p.mobileEnc ? deps.cipher.decrypt(p.mobileEnc) : null;
    return { fileNumber: p.fileNumber, status: p.status, name, visits, invitedTo: mobile ? `•••• ${mobile.slice(-4)}` : null };
  });

  app.get<{ Params: { file: string } }>("/api/provider/patients/:file/chat", async req => {
    const me = requireStaff(req, "provider");
    await requireLinked(me.id, req.params.file);
    const open = await findSession(deps, req.params.file, me.id, "open");
    const locked = await findSession(deps, req.params.file, me.id, "locked");
    const { autoFinishHours } = await getRules(deps);
    return { open: open ? await sessionView(deps, open) : null, waitingForEmr: !!locked, autoFinishHours };
  });

  app.post<{ Params: { file: string } }>("/api/provider/patients/:file/chat", async req => {
    const me = requireStaff(req, "provider");
    const p = await requireLinked(me.id, req.params.file);
    if (p.status !== "active") throw new HttpError(409, "patient_not_active", "The patient hasn't created an account yet");
    if (await findSession(deps, p.fileNumber, me.id, "open")) throw new HttpError(409, "already_open");
    const s = await startSession(deps, p.fileNumber, me.id, "provider", actor(me.id, req.ip));
    return sessionView(deps, s);
  });

  async function openSessionFor(meId: string, file: string) {
    await requireLinked(meId, file);
    const s = await findSession(deps, file, meId, "open");
    if (!s) throw new HttpError(409, "no_open_chat", "There is no open chat");
    return s;
  }

  app.post<{ Params: { file: string } }>("/api/provider/patients/:file/chat/messages", async req => {
    const me = requireStaff(req, "provider");
    const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body);
    const s = await openSessionFor(me.id, req.params.file);
    await addMessage(deps, s, "provider", { text });
    return sessionView(deps, s);
  });

  app.post<{ Params: { file: string } }>("/api/provider/patients/:file/chat/files", async req => {
    const me = requireStaff(req, "provider");
    const s = await openSessionFor(me.id, req.params.file);
    await addMessage(deps, s, "provider", { file: await readUpload(deps, req) });
    return sessionView(deps, s);
  });

  app.post<{ Params: { file: string } }>("/api/provider/patients/:file/chat/finish", async req => {
    const me = requireStaff(req, "provider");
    const s = await openSessionFor(me.id, req.params.file);
    const view = await sessionView(deps, s);
    const result = await finishSession(deps, s, "provider", actor(me.id, req.ip));
    return {
      ...result,
      messageCount: view.messages.filter(m => m.kind === "text").length,
      fileCount: view.messages.filter(m => m.kind === "file").length
    };
  });

  app.get<{ Params: { file: string } }>("/api/provider/patients/:file/records", async req => {
    const me = requireStaff(req, "provider");
    await requireLinked(me.id, req.params.file);
    const list = await deps.emr.listChatRecords(req.params.file);
    const team = await deps.db.select({ staffId: staff.emrStaffId, en: staff.nameEn, ar: staff.nameAr }).from(staff);
    const consent = await deps.db.query.consents.findFirst({ where: and(eq(consents.fileNumber, req.params.file), eq(consents.providerId, me.id)) });
    const named = list.map(r => {
      const t = team.find(x => x.staffId === r.providerStaffId);
      return { ...r, providerName: t ? { en: t.en, ar: t.ar } : { en: r.providerStaffId } };
    });
    return {
      mine: named.filter(r => r.providerStaffId === me.emrStaffId),
      others: named.filter(r => r.providerStaffId !== me.emrStaffId),
      consent: consent?.status ?? null
    };
  });

  app.post<{ Params: { file: string } }>("/api/provider/patients/:file/consent-request", async req => {
    const me = requireStaff(req, "provider");
    await requireLinked(me.id, req.params.file);
    await deps.db.insert(consents).values({ fileNumber: req.params.file, providerId: me.id, status: "pending", requestedAt: deps.now() })
      .onConflictDoUpdate({ target: [consents.fileNumber, consents.providerId], set: { status: "pending", requestedAt: deps.now(), decidedAt: null } });
    const p = await deps.db.query.patients.findFirst({ where: eq(patients.fileNumber, req.params.file) });
    if (p?.mobileEnc) await deps.notifier.sms(deps.cipher.decrypt(p.mobileEnc), "Vwelfare: you have a new request in Vwelfare Connect. Sign in to see it.");
    await audit(deps, actor(me.id, req.ip), "consent_requested", req.params.file);
    deps.hub.publish([patientKey(req.params.file)], { type: "consent", fileNumber: req.params.file });
    return { status: "pending" };
  });

  /** A provider may read their own past chats, and other providers' only with the patient's consent. */
  async function checkRecordAccess(me: typeof staff.$inferSelect, recordId: string) {
    const r = await deps.emr.getChatRecord(recordId);
    if (!r) throw new HttpError(404, "not_found");
    await requireLinked(me.id, r.fileNumber);
    if (r.provider.staffId !== me.emrStaffId) {
      const c = await deps.db.query.consents.findFirst({ where: and(eq(consents.fileNumber, r.fileNumber), eq(consents.providerId, me.id)) });
      if (c?.status !== "granted") throw new HttpError(403, "consent_required", "The patient's consent is needed to read this chat");
    }
    return r;
  }

  app.get<{ Params: { recordId: string } }>("/api/provider/records/:recordId", async req => {
    const me = requireStaff(req, "provider");
    const r = await checkRecordAccess(me, req.params.recordId);
    const t = await deps.db.query.staff.findFirst({ where: eq(staff.emrStaffId, r.provider.staffId) });
    await audit(deps, actor(me.id, req.ip), "record_viewed", r.recordName);
    return recordView(r, t ? { en: t.nameEn, ar: t.nameAr } : null);
  });

  app.get<{ Params: { recordId: string; attId: string } }>("/api/provider/records/:recordId/attachments/:attId", async (req, reply) => {
    const me = requireStaff(req, "provider");
    await checkRecordAccess(me, req.params.recordId);
    const a = await deps.emr.getAttachment(req.params.recordId, req.params.attId);
    if (!a) throw new HttpError(404, "not_found");
    return sendProtectedFile(reply, a.mimeType, a.content);
  });
}
