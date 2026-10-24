import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gt, isNull, like, or, sql } from "drizzle-orm";
import { auditLog, authSessions, chatSessions, invitations, patients, providerPatients, staff } from "../db/schema.ts";
import { newToken, sha256 } from "../lib/crypto.ts";
import { HttpError, type Deps } from "../deps.ts";
import { requireStaff } from "../auth.ts";
import { audit } from "../services/audit.ts";
import { getRules, rulesSchema, saveRules } from "../services/rules.ts";
import { finishSession, LEASE_MS } from "../services/chat.ts";
import { patientKey, staffKey } from "../realtime.ts";

const INVITE_HOURS = 72;
const fileNumber = z.string().trim().regex(/^\d{3,12}$/);

export function adminRoutes(app: FastifyInstance, deps: Deps) {
  app.get("/api/admin/providers", async req => {
    requireStaff(req, "admin");
    const now = deps.now();
    // Written out in full: chat_sessions has its own "id", so a bare "id" in the subquery would mean the chat's.
    const staffId = sql.raw(`"staff"."id"`);
    const rows = await deps.db.select({
      id: staff.id, email: staff.email, nameEn: staff.nameEn, nameAr: staff.nameAr, specialtyEn: staff.specialtyEn, specialtyAr: staff.specialtyAr,
      emrStaffId: staff.emrStaffId, active: staff.active, mfaEnabled: staff.mfaEnabled, hasPassword: sql<boolean>`${staff.passwordHash} is not null`,
      locked: sql<boolean>`coalesce(${staff.lockedUntil} > ${now.toISOString()}::timestamptz, false)`,
      patients: sql<number>`(select count(*)::int from ${providerPatients} where ${providerPatients.providerId} = ${staffId} and ${providerPatients.status} = 'accepted')`,
      openChats: sql<number>`(select count(*)::int from ${chatSessions} where ${chatSessions.providerId} = ${staffId} and ${chatSessions.status} = 'open')`
    }).from(staff).where(eq(staff.role, "provider")).orderBy(staff.nameEn);
    return rows;
  });

  app.post("/api/admin/providers", async req => {
    const admin = requireStaff(req, "admin");
    const body = z.object({
      nameEn: z.string().trim().min(2).max(120),
      nameAr: z.string().trim().max(120).optional(),
      specialtyEn: z.string().trim().min(2).max(120),
      specialtyAr: z.string().trim().max(120).optional(),
      email: z.string().trim().toLowerCase().email(),
      emrStaffId: z.string().trim().min(1).max(60)
    }).parse(req.body);
    if (await deps.db.query.staff.findFirst({ where: eq(staff.email, body.email) })) throw new HttpError(409, "email_taken", "A provider with this email already exists");
    const [p] = await deps.db.insert(staff).values({ ...body, role: "provider", nameAr: body.nameAr || null, specialtyAr: body.specialtyAr || null }).returning();
    const token = newToken();
    await deps.db.insert(invitations).values({ kind: "staff", subject: p!.id, tokenHash: sha256(token), expiresAt: new Date(deps.now().getTime() + INVITE_HOURS * 3600_000) });
    await deps.notifier.email(body.email, "Your Vwelfare Connect account",
      `Set your password and sign-in app here (link valid for ${INVITE_HOURS} hours): ${deps.config.APP_BASE_URL}/invite/staff#${token}`);
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "provider_created", p!.id);
    return { id: p!.id };
  });

  app.get<{ Params: { id: string } }>("/api/admin/providers/:id/impact", async req => {
    requireStaff(req, "admin");
    const [row] = await deps.db.select({
      openChats: sql<number>`(select count(*)::int from ${chatSessions} where ${chatSessions.providerId} = ${req.params.id} and ${chatSessions.status} = 'open')`,
      patients: sql<number>`(select count(*)::int from ${providerPatients} where ${providerPatients.providerId} = ${req.params.id} and ${providerPatients.status} = 'accepted')`
    }).from(staff).where(eq(staff.id, req.params.id));
    if (!row) throw new HttpError(404, "not_found");
    return row;
  });

  app.post<{ Params: { id: string } }>("/api/admin/providers/:id/deactivate", async req => {
    const admin = requireStaff(req, "admin");
    const p = await deps.db.query.staff.findFirst({ where: and(eq(staff.id, req.params.id), eq(staff.role, "provider")) });
    if (!p) throw new HttpError(404, "not_found");
    await deps.db.update(staff).set({ active: false }).where(eq(staff.id, p.id));
    await deps.db.delete(authSessions).where(and(eq(authSessions.kind, "staff"), eq(authSessions.subjectId, p.id)));
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "provider_deactivated", p.id);
    const open = await deps.db.select().from(chatSessions).where(and(eq(chatSessions.providerId, p.id), eq(chatSessions.status, "open")));
    const results = [];
    for (const s of open) results.push(await finishSession(deps, s, "deactivation", { type: "admin", id: admin.id, ip: req.ip }));
    return { finishedChats: results.length, saved: results.filter(r => r.status === "saved").length };
  });

  app.post<{ Params: { id: string } }>("/api/admin/providers/:id/reactivate", async req => {
    const admin = requireStaff(req, "admin");
    await deps.db.update(staff).set({ active: true }).where(and(eq(staff.id, req.params.id), eq(staff.role, "provider")));
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "provider_reactivated", req.params.id);
    return { ok: true };
  });

  // Provider who hasn't set a password yet: a fresh set-up link replaces any earlier one.
  app.post<{ Params: { id: string } }>("/api/admin/providers/:id/resend-invite", async req => {
    const admin = requireStaff(req, "admin");
    const id = z.string().uuid().safeParse(req.params.id);
    const p = id.success ? await deps.db.query.staff.findFirst({ where: and(eq(staff.id, id.data), eq(staff.role, "provider")) }) : undefined;
    if (!p) throw new HttpError(404, "not_found");
    if (p.passwordHash) throw new HttpError(409, "already_set_up", "This provider has already set a password");
    if (!p.active) throw new HttpError(409, "account_deactivated", "Reactivate this account first");
    const token = await replaceInvitation("staff", p.id);
    await deps.notifier.email(p.email, "Your Vwelfare Connect account",
      `Set your password and sign-in app here (link valid for ${INVITE_HOURS} hours): ${deps.config.APP_BASE_URL}/invite/staff#${token}`);
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "invite_resent", p.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/admin/providers/:id/unlock", async req => {
    const admin = requireStaff(req, "admin");
    const id = z.string().uuid().safeParse(req.params.id);
    const [p] = id.success
      ? await deps.db.update(staff).set({ failedLogins: 0, lockedUntil: null }).where(and(eq(staff.id, id.data), eq(staff.role, "provider"))).returning({ id: staff.id })
      : [];
    if (!p) throw new HttpError(404, "not_found");
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "account_unlocked", p.id);
    return { ok: true };
  });

  async function findProvider(id: string) {
    const ok = z.string().uuid().safeParse(id);
    const p = ok.success ? await deps.db.query.staff.findFirst({ where: and(eq(staff.id, ok.data), eq(staff.role, "provider")) }) : undefined;
    if (!p) throw new HttpError(404, "not_found");
    return p;
  }

  app.put<{ Params: { id: string } }>("/api/admin/providers/:id", async req => {
    const admin = requireStaff(req, "admin");
    const p = await findProvider(req.params.id);
    const body = z.object({
      nameEn: z.string().trim().min(2).max(120),
      nameAr: z.string().trim().max(120).optional(),
      specialtyEn: z.string().trim().min(2).max(120),
      specialtyAr: z.string().trim().max(120).optional(),
      email: z.string().trim().toLowerCase().email(),
      emrStaffId: z.string().trim().min(1).max(60)
    }).parse(req.body);
    if (body.email !== p.email && await deps.db.query.staff.findFirst({ where: eq(staff.email, body.email) })) {
      throw new HttpError(409, "email_taken", "A provider with this email already exists");
    }
    await deps.db.update(staff).set({ ...body, nameAr: body.nameAr || null, specialtyAr: body.specialtyAr || null }).where(eq(staff.id, p.id));
    // Field names only: the audit log never holds the values.
    const changed = (Object.keys(body) as Array<keyof typeof body>).filter(k => (body[k] || null) !== (p[k] || null));
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "provider_changed", p.id, { fields: changed });
    if (changed.includes("email")) {
      await deps.notifier.email(p.email, "Your Vwelfare Connect sign-in email was changed",
        "The email you use to sign in to Vwelfare Connect was changed by the center's admin. If you didn't expect this, contact the center.");
    }
    return { ok: true };
  });

  // Lost phone or forgotten password: the old password and authenticator stop working and a new set-up link goes out.
  app.post<{ Params: { id: string } }>("/api/admin/providers/:id/reset-sign-in", async req => {
    const admin = requireStaff(req, "admin");
    const p = await findProvider(req.params.id);
    if (!p.active) throw new HttpError(409, "account_deactivated", "Reactivate this account first");
    await deps.db.update(staff).set({ passwordHash: null, mfaSecretEnc: null, mfaEnabled: false, mfaLastStep: null, failedLogins: 0, lockedUntil: null })
      .where(eq(staff.id, p.id));
    await deps.db.delete(authSessions).where(and(eq(authSessions.kind, "staff"), eq(authSessions.subjectId, p.id)));
    const token = await replaceInvitation("staff", p.id);
    await deps.notifier.email(p.email, "Set up your Vwelfare Connect sign-in again",
      `Your sign-in was reset by the center's admin. Set a new password and sign-in app here (link valid for ${INVITE_HOURS} hours): ${deps.config.APP_BASE_URL}/invite/staff#${token}`);
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "provider_sign_in_reset", p.id);
    return { ok: true };
  });

  // The provider's linked and waiting patients, by file number.
  app.get<{ Params: { id: string } }>("/api/admin/providers/:id/patients", async req => {
    requireStaff(req, "admin");
    const p = await findProvider(req.params.id);
    return deps.db.select({ fileNumber: providerPatients.fileNumber, link: providerPatients.status, since: providerPatients.createdAt, status: patients.status })
      .from(providerPatients).innerJoin(patients, eq(patients.fileNumber, providerPatients.fileNumber))
      .where(eq(providerPatients.providerId, p.id)).orderBy(providerPatients.fileNumber);
  });

  // When a provider leaves, each of their patients is asked to accept the new provider: the care-team rule still applies.
  app.post<{ Params: { id: string } }>("/api/admin/providers/:id/handover", async req => {
    const admin = requireStaff(req, "admin");
    const from = await findProvider(req.params.id);
    const { toProviderId } = z.object({ toProviderId: z.string().uuid() }).parse(req.body);
    const to = await findProvider(toProviderId);
    if (to.id === from.id || !to.active) throw new HttpError(400, "bad_handover", "Choose another active provider");
    const theirs = await deps.db.select({ fileNumber: patients.fileNumber, status: patients.status, mobileEnc: patients.mobileEnc })
      .from(providerPatients).innerJoin(patients, eq(patients.fileNumber, providerPatients.fileNumber))
      .where(and(eq(providerPatients.providerId, from.id), eq(providerPatients.status, "accepted")));
    const now = deps.now();
    let requested = 0, already = 0, skipped = 0;
    for (const pt of theirs) {
      if (pt.status === "deactivated") { skipped++; continue; }
      const link = await deps.db.query.providerPatients.findFirst({ where: and(eq(providerPatients.providerId, to.id), eq(providerPatients.fileNumber, pt.fileNumber)) });
      if (link?.status === "accepted" || link?.status === "pending") { already++; continue; }
      await deps.db.insert(providerPatients).values({ providerId: to.id, fileNumber: pt.fileNumber, status: "pending", createdAt: now })
        .onConflictDoUpdate({ target: [providerPatients.providerId, providerPatients.fileNumber], set: { status: "pending", createdAt: now, decidedAt: null } });
      // A patient who hasn't signed up yet sees the request once they have; the invitation SMS is enough for now.
      if (pt.status === "active" && pt.mobileEnc) await deps.notifier.sms(deps.cipher.decrypt(pt.mobileEnc), "Vwelfare: you have a new request in Vwelfare Connect. Sign in to see it.");
      deps.hub.publish([patientKey(pt.fileNumber), staffKey(to.id)], { type: "team", fileNumber: pt.fileNumber });
      requested++;
    }
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "care_team_handover", from.id, { to: to.id, requested, already, skipped });
    return { requested, already, skipped };
  });

  // A care-team request the patient never answered.
  app.delete<{ Params: { id: string; file: string } }>("/api/admin/providers/:id/patients/:file", async req => {
    const admin = requireStaff(req, "admin");
    const p = await findProvider(req.params.id);
    const gone = await deps.db.delete(providerPatients)
      .where(and(eq(providerPatients.providerId, p.id), eq(providerPatients.fileNumber, req.params.file), eq(providerPatients.status, "pending")))
      .returning({ file: providerPatients.fileNumber });
    if (!gone.length) throw new HttpError(409, "no_pending_request", "There is no waiting request to cancel");
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "care_team_request_cancelled", req.params.file, { provider: p.id });
    deps.hub.publish([patientKey(req.params.file), staffKey(p.id)], { type: "team", fileNumber: req.params.file });
    return { ok: true };
  });

  /** Ends every unused invitation for this person and stores a new one. Returns the token for the link. */
  async function replaceInvitation(kind: "staff" | "patient", subject: string) {
    const now = deps.now();
    const token = newToken();
    await deps.db.transaction(async tx => {
      await tx.update(invitations).set({ expiresAt: now })
        .where(and(eq(invitations.kind, kind), eq(invitations.subject, subject), isNull(invitations.usedAt), gt(invitations.expiresAt, now)));
      await tx.insert(invitations).values({ kind, subject, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + INVITE_HOURS * 3600_000) });
    });
    return token;
  }

  // ---- patients ----
  // File numbers, account states and counts only. Patient names live in the EMR and are not shown to the admin.

  app.get("/api/admin/patients", async req => {
    requireStaff(req, "admin");
    const now = deps.now();
    // Written out in full: inside the subqueries a bare "file_number" would mean the subquery's own table.
    const file = sql.raw(`"patients"."file_number"`);
    const rows = await deps.db.select({
      fileNumber: patients.fileNumber, status: patients.status, createdAt: patients.createdAt, invitedBy: patients.invitedBy,
      locked: sql<boolean>`coalesce(${patients.lockedUntil} > ${now.toISOString()}::timestamptz, false)`,
      team: sql<number>`(select count(*)::int from ${providerPatients} where ${providerPatients.fileNumber} = ${file} and ${providerPatients.status} = 'accepted')`,
      pending: sql<number>`(select count(*)::int from ${providerPatients} where ${providerPatients.fileNumber} = ${file} and ${providerPatients.status} = 'pending')`,
      openChats: sql<number>`(select count(*)::int from ${chatSessions} where ${chatSessions.fileNumber} = ${file} and ${chatSessions.status} = 'open')`,
      waitingForEmr: sql<number>`(select count(*)::int from ${chatSessions} where ${chatSessions.fileNumber} = ${file} and ${chatSessions.status} = 'locked')`,
      inviteExpiresAt: sql<string | null>`(select max(${invitations.expiresAt}) from ${invitations} where ${invitations.kind} = 'patient' and ${invitations.subject} = ${file} and ${invitations.usedAt} is null)`,
      lastSignIn: sql<string | null>`(select max(${auditLog.at}) from ${auditLog} where ${auditLog.actorType} = 'patient' and ${auditLog.actorId} = ${file} and ${auditLog.action} = 'signed_in')`,
      providerIds: sql<string[] | null>`(select array_agg(${providerPatients.providerId}::text) from ${providerPatients} where ${providerPatients.fileNumber} = ${file} and ${providerPatients.status} = 'accepted')`
    }).from(patients).orderBy(desc(patients.createdAt));
    return rows.map(r => ({ ...r, providerIds: r.providerIds ?? [], waitingForEmr: r.waitingForEmr > 0 }));
  });

  async function findPatient(file: string) {
    const f = fileNumber.safeParse(file);
    const p = f.success ? await deps.db.query.patients.findFirst({ where: eq(patients.fileNumber, f.data) }) : undefined;
    if (!p) throw new HttpError(404, "not_found");
    return p;
  }

  app.get<{ Params: { file: string } }>("/api/admin/patients/:file", async req => {
    requireStaff(req, "admin");
    const p = await findPatient(req.params.file);
    const team = await deps.db.select({
      providerId: staff.id, nameEn: staff.nameEn, nameAr: staff.nameAr, specialtyEn: staff.specialtyEn, specialtyAr: staff.specialtyAr,
      active: staff.active, link: providerPatients.status, since: providerPatients.createdAt, decidedAt: providerPatients.decidedAt
    }).from(providerPatients).innerJoin(staff, eq(staff.id, providerPatients.providerId))
      .where(eq(providerPatients.fileNumber, p.fileNumber)).orderBy(providerPatients.createdAt);
    const invite = await deps.db.query.invitations.findFirst({
      where: and(eq(invitations.kind, "patient"), eq(invitations.subject, p.fileNumber)), orderBy: desc(invitations.createdAt)
    });
    const activity = await deps.db.select({ id: auditLog.id, at: auditLog.at, actorType: auditLog.actorType, actorId: auditLog.actorId, action: auditLog.action })
      .from(auditLog)
      // Chat events name the record, which starts with the file number ("10633_2026-10-21_09-00").
      .where(or(and(eq(auditLog.actorType, "patient"), eq(auditLog.actorId, p.fileNumber)), eq(auditLog.target, p.fileNumber), like(auditLog.target, `${p.fileNumber}\\_%`)))
      .orderBy(desc(auditLog.id)).limit(50);
    const mobile = p.mobileEnc ? deps.cipher.decrypt(p.mobileEnc) : null;
    const [{ openChats }] = await deps.db.select({ openChats: sql<number>`count(*)::int` }).from(chatSessions)
      .where(and(eq(chatSessions.fileNumber, p.fileNumber), eq(chatSessions.status, "open")));
    return {
      openChats,
      fileNumber: p.fileNumber, status: p.status, createdAt: p.createdAt, termsAcceptedAt: p.termsAcceptedAt,
      locked: !!p.lockedUntil && p.lockedUntil > deps.now(),
      // Enough to confirm the number with the patient on the phone, never the whole number.
      mobileEnd: mobile ? mobile.slice(-2) : null,
      team,
      invitation: invite ? { sentAt: invite.createdAt, expiresAt: invite.expiresAt, usedAt: invite.usedAt } : null,
      activity
    };
  });

  // A new link for a patient who hasn't created their account yet, to the stored mobile or a corrected one.
  app.post<{ Params: { file: string } }>("/api/admin/patients/:file/resend-invite", async req => {
    const admin = requireStaff(req, "admin");
    const p = await findPatient(req.params.file);
    if (p.status !== "invited") throw new HttpError(409, "already_set_up", "This patient has already created their account");
    const { mobile } = z.object({ mobile: z.string().optional() }).parse(req.body ?? {});
    let digits = mobile ? mobile.replace(/[^\d+]/g, "") : null;
    if (digits !== null && digits.replace("+", "").length < 8) throw new HttpError(400, "bad_mobile", "Enter a mobile number with at least 8 digits");
    if (digits) await deps.db.update(patients).set({ mobileEnc: deps.cipher.encrypt(digits) }).where(eq(patients.fileNumber, p.fileNumber));
    else digits = p.mobileEnc ? deps.cipher.decrypt(p.mobileEnc) : null;
    if (!digits) throw new HttpError(400, "bad_mobile", "Enter a mobile number with at least 8 digits");
    const token = await replaceInvitation("patient", p.fileNumber);
    await deps.notifier.sms(digits, `Vwelfare: you're invited to message your care team securely. Set up your account (valid ${INVITE_HOURS} hours): ${deps.config.APP_BASE_URL}/invite/patient#${token}`);
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, mobile ? "invite_resent_new_mobile" : "invite_resent", p.fileNumber);
    return { ok: true };
  });

  app.post<{ Params: { file: string } }>("/api/admin/patients/:file/cancel-invite", async req => {
    const admin = requireStaff(req, "admin");
    const p = await findPatient(req.params.file);
    const now = deps.now();
    const ended = await deps.db.update(invitations).set({ expiresAt: now })
      .where(and(eq(invitations.kind, "patient"), eq(invitations.subject, p.fileNumber), isNull(invitations.usedAt), gt(invitations.expiresAt, now)))
      .returning({ id: invitations.id });
    if (!ended.length) throw new HttpError(409, "no_open_invite", "There is no invitation link waiting to be used");
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "invite_cancelled", p.fileNumber);
    return { ok: true };
  });

  app.post<{ Params: { file: string } }>("/api/admin/patients/:file/unlock", async req => {
    const admin = requireStaff(req, "admin");
    const p = await findPatient(req.params.file);
    await deps.db.update(patients).set({ failedLogins: 0, lockedUntil: null }).where(eq(patients.fileNumber, p.fileNumber));
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "account_unlocked", p.fileNumber);
    return { ok: true };
  });

  // Signs the patient out, ends any invitation link, and finishes their open chats so they are saved to the EMR.
  app.post<{ Params: { file: string } }>("/api/admin/patients/:file/deactivate", async req => {
    const admin = requireStaff(req, "admin");
    const p = await findPatient(req.params.file);
    if (p.status === "deactivated") return { finishedChats: 0, saved: 0 };
    const now = deps.now();
    await deps.db.update(patients).set({ status: "deactivated" }).where(eq(patients.fileNumber, p.fileNumber));
    await deps.db.delete(authSessions).where(and(eq(authSessions.kind, "patient"), eq(authSessions.subjectId, p.fileNumber)));
    await deps.db.update(invitations).set({ expiresAt: now })
      .where(and(eq(invitations.kind, "patient"), eq(invitations.subject, p.fileNumber), isNull(invitations.usedAt), gt(invitations.expiresAt, now)));
    const actor = { type: "admin" as const, id: admin.id, ip: req.ip };
    await audit(deps, actor, "patient_deactivated", p.fileNumber);
    const open = await deps.db.select().from(chatSessions).where(and(eq(chatSessions.fileNumber, p.fileNumber), eq(chatSessions.status, "open")));
    const results = [];
    for (const s of open) results.push(await finishSession(deps, s, "deactivation", actor));
    return { finishedChats: results.length, saved: results.filter(r => r.status === "saved").length };
  });

  // Back to "active" if they had created an account, otherwise to "invited" (then send a new invitation).
  app.post<{ Params: { file: string } }>("/api/admin/patients/:file/reactivate", async req => {
    const admin = requireStaff(req, "admin");
    const p = await findPatient(req.params.file);
    if (p.status !== "deactivated") return { status: p.status };
    const status = p.passwordHash ? "active" as const : "invited" as const;
    await deps.db.update(patients).set({ status, failedLogins: 0, lockedUntil: null }).where(eq(patients.fileNumber, p.fileNumber));
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "patient_reactivated", p.fileNumber);
    return { status };
  });

  // Finished chats still waiting for the EMR. Record names and error codes only: no content, no patient names.
  app.get("/api/admin/sync-queue", async req => {
    requireStaff(req, "admin");
    return deps.db.select({
      id: chatSessions.id, recordName: chatSessions.recordName, finishedBy: chatSessions.finishedBy, endedAt: chatSessions.endedAt,
      attempts: chatSessions.syncAttempts, nextAttemptAt: chatSessions.nextAttemptAt, lastError: chatSessions.lastError
    }).from(chatSessions).where(eq(chatSessions.status, "locked")).orderBy(chatSessions.endedAt);
  });

  // "Try again now", for example after the EMR vendor fixed what made it refuse the chat. The worker sends it within seconds.
  app.post<{ Params: { id: string } }>("/api/admin/sync-queue/:id/retry", async req => {
    const admin = requireStaff(req, "admin");
    const id = z.string().uuid().safeParse(req.params.id);
    const notWaiting = new HttpError(404, "not_found", "This chat is no longer waiting for the EMR");
    if (!id.success) throw notWaiting;
    const now = deps.now();
    // Only a chat waiting out a longer retry gap: one being sent right now holds a lease of LEASE_MS, and is left alone.
    const [s] = await deps.db.update(chatSessions).set({ nextAttemptAt: now })
      .where(and(eq(chatSessions.id, id.data), eq(chatSessions.status, "locked"), gt(chatSessions.nextAttemptAt, new Date(now.getTime() + LEASE_MS))))
      .returning({ recordName: chatSessions.recordName });
    if (!s) {
      const cur = await deps.db.query.chatSessions.findFirst({ where: and(eq(chatSessions.id, id.data), eq(chatSessions.status, "locked")) });
      if (!cur) throw notWaiting;
      throw new HttpError(409, "retry_soon", "This chat is being sent now or will be tried again within 2 minutes");
    }
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "chat_sync_retry_requested", s.recordName);
    return { ok: true };
  });

  app.get("/api/admin/rules", async req => {
    requireStaff(req, "admin");
    return getRules(deps);
  });

  app.put("/api/admin/rules", async req => {
    const admin = requireStaff(req, "admin");
    const rules = rulesSchema.parse(req.body);
    await saveRules(deps, rules);
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "rules_changed");
    return rules;
  });

  app.get<{ Querystring: { q?: string; who?: string; limit?: string } }>("/api/admin/audit", async req => {
    requireStaff(req, "admin");
    const who = z.enum(["all", "admin", "provider", "patient", "system"]).catch("all").parse(req.query.who ?? "all");
    const q = (req.query.q ?? "").trim().toLowerCase();
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const rows = await deps.db.select({
      id: auditLog.id, at: auditLog.at, actorType: auditLog.actorType, actorId: auditLog.actorId, action: auditLog.action, target: auditLog.target,
      actorName: staff.nameEn
    }).from(auditLog)
      .leftJoin(staff, sql`${staff.id}::text = ${auditLog.actorId}`)
      .where(who === "all" ? undefined : eq(auditLog.actorType, who))
      .orderBy(desc(auditLog.id)).limit(q ? 2000 : limit);
    const staffNames = new Map((await deps.db.select({ id: staff.id, n: staff.nameEn }).from(staff)).map(s => [s.id, s.n]));
    const out = rows.map(r => ({ ...r, targetName: r.target ? staffNames.get(r.target) ?? null : null }));
    return q
      ? out.filter(r => [r.actorName, r.actorId, r.action, r.target, r.targetName].some(v => v && String(v).toLowerCase().includes(q))).slice(0, limit)
      : out;
  });
}
