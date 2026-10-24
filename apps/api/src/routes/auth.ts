import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import QRCode from "qrcode";
import { codeStep, mfaUri, newMfaSecret } from "../lib/totp.ts";
import { authSessions, invitations, patients, staff } from "../db/schema.ts";
import { hashPassword, sha256, verifyPassword } from "../lib/crypto.ts";
import { HttpError, type Deps } from "../deps.ts";
import { endSession, startSession } from "../auth.ts";
import { audit } from "../services/audit.ts";
import { getRules } from "../services/rules.ts";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const password = z.string().min(8).max(200);

export function authRoutes(app: FastifyInstance, deps: Deps) {
  const limited = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  async function findInvitation(token: string, kind: "staff" | "patient") {
    const inv = await deps.db.query.invitations.findFirst({
      where: and(eq(invitations.tokenHash, sha256(token)), eq(invitations.kind, kind), isNull(invitations.usedAt), gt(invitations.expiresAt, deps.now()))
    });
    if (!inv) throw new HttpError(410, "invitation_invalid", "This invitation link has expired or was already used");
    return inv;
  }

  /** Locks the account after repeated failures. Returns true when the account is currently locked. */
  async function checkLock(row: { failedLogins: number; lockedUntil: Date | null }) {
    return !!row.lockedUntil && row.lockedUntil > deps.now();
  }

  app.get("/api/auth/me", async req => {
    const a = req.auth;
    if (!a) throw new HttpError(401, "not_signed_in");
    if (a.kind === "staff") {
      return { kind: "staff", role: a.staff.role, id: a.staff.id, email: a.staff.email, mfaOk: a.mfaOk, mfaEnabled: a.staff.mfaEnabled,
        name: { en: a.staff.nameEn, ar: a.staff.nameAr }, specialty: { en: a.staff.specialtyEn, ar: a.staff.specialtyAr } };
    }
    return { kind: "patient", fileNumber: a.patient.fileNumber, username: a.patient.username };
  });

  // Shown on sign-in screens too, so patients can reach help without signing in.
  app.get("/api/public/help", async () => {
    const r = await getRules(deps);
    return { emergencyNumber: r.emergencyNumber, crisisLineNumber: r.crisisLineNumber };
  });

  // ---- staff ----
  app.post("/api/auth/staff/login", limited, async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const s = await deps.db.query.staff.findFirst({ where: eq(staff.email, body.email.toLowerCase()) });
    if (s && await checkLock(s)) throw new HttpError(423, "locked", "Too many attempts. Try again in 15 minutes.");
    if (!s || !s.active || !(await verifyPassword(body.password, s.passwordHash))) {
      if (s) {
        const failed = s.failedLogins + 1;
        await deps.db.update(staff).set({ failedLogins: failed, lockedUntil: failed >= MAX_FAILURES ? new Date(deps.now().getTime() + LOCK_MINUTES * 60_000) : null }).where(eq(staff.id, s.id));
        await audit(deps, { type: s.role, id: s.id, ip: req.ip }, "sign_in_failed");
      }
      throw new HttpError(401, "bad_credentials", "Email or password is incorrect");
    }
    // The failure count is reset only once the authenticator code is right too: a correct password alone
    // must not give someone with the password a fresh set of code guesses.
    await startSession(deps, reply, "staff", s.id, false);
    return { next: s.mfaEnabled ? "mfa" : "mfa-setup" };
  });

  app.get("/api/auth/staff/mfa-setup", async req => {
    const a = req.auth;
    if (!a || a.kind !== "staff") throw new HttpError(401, "not_signed_in");
    if (a.staff.mfaEnabled) throw new HttpError(409, "mfa_already_set_up");
    let secret = a.staff.mfaSecretEnc ? deps.cipher.decrypt(a.staff.mfaSecretEnc) : null;
    if (!secret) {
      secret = newMfaSecret();
      await deps.db.update(staff).set({ mfaSecretEnc: deps.cipher.encrypt(secret) }).where(eq(staff.id, a.staff.id));
    }
    const otpauthUrl = mfaUri(a.staff.email, secret);
    return { secret, otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl) };
  });

  app.post("/api/auth/staff/mfa", limited, async (req, reply) => {
    const a = req.auth;
    if (!a || a.kind !== "staff") throw new HttpError(401, "not_signed_in");
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const fresh = await deps.db.query.staff.findFirst({ where: eq(staff.id, a.staff.id) });
    if (!fresh?.mfaSecretEnc) throw new HttpError(409, "mfa_not_set_up");
    if (await checkLock(fresh)) {
      await endSession(deps, req, reply);
      throw new HttpError(423, "locked", "Too many attempts. Try again in 15 minutes.");
    }

    // Wrong codes count against the account, like wrong passwords, so codes can't be guessed from many addresses.
    async function fail(err: HttpError): Promise<never> {
      const failed = fresh!.failedLogins + 1;
      const lock = failed >= MAX_FAILURES;
      await deps.db.update(staff).set({ failedLogins: failed, lockedUntil: lock ? new Date(deps.now().getTime() + LOCK_MINUTES * 60_000) : null }).where(eq(staff.id, fresh!.id));
      await audit(deps, { type: fresh!.role, id: fresh!.id, ip: req.ip }, "sign_in_failed", null, { step: "code" });
      if (lock) {
        await endSession(deps, req, reply);
        throw new HttpError(423, "locked", "Too many attempts. Try again in 15 minutes.");
      }
      throw err;
    }

    // Codes are checked against the real clock, as authenticator apps use it.
    const step = codeStep(code, deps.cipher.decrypt(fresh.mfaSecretEnc));
    if (step === null) return fail(new HttpError(401, "bad_code", "That code didn't match. Check your authenticator app and try again."));
    // Each code works once: claim its time step, so a code seen over someone's shoulder or replayed is refused.
    const claimed = await deps.db.update(staff)
      .set({ mfaLastStep: step, mfaEnabled: true, failedLogins: 0, lockedUntil: null })
      .where(and(eq(staff.id, fresh.id), or(isNull(staff.mfaLastStep), lt(staff.mfaLastStep, step))))
      .returning({ id: staff.id });
    if (!claimed.length) return fail(new HttpError(401, "code_used", "That code was already used. Wait for the next code in your authenticator app and enter it."));
    await deps.db.update(authSessions).set({ mfaOk: true }).where(eq(authSessions.id, a.sessionId));
    await audit(deps, { type: fresh.role, id: fresh.id, ip: req.ip }, "signed_in");
    return { ok: true, role: fresh.role };
  });

  // Invitation links carry the token after "#", which browsers never send, and the app posts it here in the body,
  // so a working token never appears in a URL that servers, proxies or Vercel log.
  const inviteBody = z.object({ token: z.string().min(1).max(200) });

  app.post("/api/auth/invite/staff", limited, async req => {
    const inv = await findInvitation(inviteBody.parse(req.body).token, "staff");
    const s = await deps.db.query.staff.findFirst({ where: eq(staff.id, inv.subject) });
    return { email: s?.email, name: { en: s?.nameEn, ar: s?.nameAr } };
  });

  app.post("/api/auth/staff/accept-invite", limited, async req => {
    const body = z.object({ token: z.string(), password }).parse(req.body);
    const inv = await findInvitation(body.token, "staff");
    await deps.db.update(staff).set({ passwordHash: await hashPassword(body.password) }).where(eq(staff.id, inv.subject));
    await deps.db.update(invitations).set({ usedAt: deps.now() }).where(eq(invitations.id, inv.id));
    await audit(deps, { type: "provider", id: inv.subject, ip: req.ip }, "account_created");
    return { ok: true };
  });

  // ---- patients ----
  app.post("/api/auth/invite/patient", limited, async req => {
    const inv = await findInvitation(inviteBody.parse(req.body).token, "patient");
    const p = await deps.db.query.patients.findFirst({ where: eq(patients.fileNumber, inv.subject) });
    const by = p?.invitedBy ? await deps.db.query.staff.findFirst({ where: eq(staff.id, p.invitedBy) }) : null;
    return { invitedBy: by ? { en: by.nameEn, ar: by.nameAr } : null };
  });

  app.post("/api/auth/patient/accept-invite", limited, async (req, reply) => {
    const body = z.object({
      token: z.string(),
      username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{4,40}$/, "Use 4–40 letters, numbers, dots, dashes or underscores"),
      password,
      acceptTerms: z.literal(true)
    }).parse(req.body);
    const inv = await findInvitation(body.token, "patient");
    const taken = await deps.db.query.patients.findFirst({ where: eq(patients.username, body.username) });
    if (taken) throw new HttpError(409, "username_taken", "That username is taken. Choose another.");
    const now = deps.now();
    await deps.db.update(patients).set({ username: body.username, passwordHash: await hashPassword(body.password), status: "active", termsAcceptedAt: now })
      .where(eq(patients.fileNumber, inv.subject));
    await deps.db.update(invitations).set({ usedAt: now }).where(eq(invitations.id, inv.id));
    await audit(deps, { type: "patient", id: inv.subject, ip: req.ip }, "account_created", inv.subject, { termsAcceptedAt: now.toISOString() });
    await startSession(deps, reply, "patient", inv.subject);
    return { ok: true };
  });

  app.post("/api/auth/patient/login", limited, async (req, reply) => {
    const body = z.object({ username: z.string().trim().toLowerCase(), password: z.string() }).parse(req.body);
    const p = await deps.db.query.patients.findFirst({ where: eq(patients.username, body.username) });
    if (p && await checkLock(p)) throw new HttpError(423, "locked", "Too many attempts. Try again in 15 minutes.");
    if (!p || p.status !== "active" || !(await verifyPassword(body.password, p.passwordHash))) {
      if (p) {
        const failed = p.failedLogins + 1;
        await deps.db.update(patients).set({ failedLogins: failed, lockedUntil: failed >= MAX_FAILURES ? new Date(deps.now().getTime() + LOCK_MINUTES * 60_000) : null }).where(eq(patients.fileNumber, p.fileNumber));
        await audit(deps, { type: "patient", id: p.fileNumber, ip: req.ip }, "sign_in_failed", p.fileNumber);
      }
      throw new HttpError(401, "bad_credentials", "Username or password is incorrect");
    }
    await deps.db.update(patients).set({ failedLogins: 0, lockedUntil: null }).where(eq(patients.fileNumber, p.fileNumber));
    await startSession(deps, reply, "patient", p.fileNumber);
    await audit(deps, { type: "patient", id: p.fileNumber, ip: req.ip }, "signed_in", p.fileNumber);
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    await endSession(deps, req, reply);
    return { ok: true };
  });
}
