// Super admin: the secrets list, behind a second password (the vault password).
// Unlocking lasts 10 minutes in the current sign-in. Every unlock, reveal and change is audited, by name only.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { authSessions, chatSessions, staff } from "../db/schema.ts";
import { hashPassword, verifyPassword } from "../lib/crypto.ts";
import { HttpError, type Deps } from "../deps.ts";
import { requireStaff } from "../auth.ts";
import { audit } from "../services/audit.ts";
import { getVault, saveVault, serviceAddressProblem } from "../services/secrets.ts";
import { probeHttp, type ProbeResult } from "../lib/probe.ts";
import { refuseBreached } from "../lib/passwords.ts";

const UNLOCK_MINUTES = 10;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const vaultPassword = z.string().min(12, "Use at least 12 characters").max(200);

export function secretsRoutes(app: FastifyInstance, deps: Deps) {
  const limited = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };
  const actor = (id: string, ip: string) => ({ type: "admin" as const, id, ip });

  /** The EMR settings decide where every chat is sent, so all admins hear about each change. Names only, never values. */
  async function alertEmrChange(name: string) {
    if (!name.startsWith("EMR_")) return;
    const admins = await deps.db.select({ email: staff.email }).from(staff).where(and(eq(staff.role, "admin"), eq(staff.active, true)));
    for (const a of admins) {
      await deps.notifier.email(a.email, "An EMR connection setting was changed",
        `The setting ${name} in the Vwelfare Connect secrets list was changed. If you didn't expect this, sign in, check the secrets list and the activity log, and change the secrets password.`);
    }
  }

  async function emailAdmins(subject: string, text: string) {
    const admins = await deps.db.select({ email: staff.email }).from(staff).where(and(eq(staff.role, "admin"), eq(staff.active, true)));
    for (const a of admins) await deps.notifier.email(a.email, subject, text);
  }

  async function unlockedUntil(req: FastifyRequest): Promise<Date | null> {
    if (!req.auth) return null;
    const row = await deps.db.query.authSessions.findFirst({ where: eq(authSessions.id, req.auth.sessionId) });
    return row?.vaultUntil && row.vaultUntil > deps.now() ? row.vaultUntil : null;
  }

  async function requireUnlocked(req: FastifyRequest) {
    const admin = requireStaff(req, "admin");
    if (!(await unlockedUntil(req))) throw new HttpError(403, "vault_locked", "Enter the secrets password first");
    return admin;
  }

  async function unlock(req: FastifyRequest) {
    const until = new Date(deps.now().getTime() + UNLOCK_MINUTES * 60_000);
    await deps.db.update(authSessions).set({ vaultUntil: until }).where(eq(authSessions.id, req.auth!.sessionId));
    return until;
  }

  app.get("/api/admin/vault", async req => {
    requireStaff(req, "admin");
    const v = await getVault(deps.db);
    const lockedUntil = v?.lockedUntil && new Date(v.lockedUntil) > deps.now() ? v.lockedUntil : null;
    return { configured: !!v, unlockedUntil: await unlockedUntil(req), lockedUntil };
  });

  app.post("/api/admin/vault/setup", limited, async req => {
    const admin = requireStaff(req, "admin");
    if (await getVault(deps.db)) throw new HttpError(409, "vault_exists", "The secrets password is already set");
    const { password } = z.object({ password: vaultPassword }).parse(req.body);
    await refuseBreached(deps.breachCheck, password, req.log);
    if (await verifyPassword(password, admin.passwordHash)) throw new HttpError(400, "same_as_sign_in", "Use a different password from your sign-in password");
    await saveVault(deps.db, { hash: await hashPassword(password), failed: 0, lockedUntil: null });
    await audit(deps, actor(admin.id, req.ip), "vault_password_set");
    return { unlockedUntil: await unlock(req) };
  });

  app.post("/api/admin/vault/unlock", limited, async req => {
    const admin = requireStaff(req, "admin");
    const { password } = z.object({ password: z.string().max(200) }).parse(req.body);
    const v = await getVault(deps.db);
    if (!v) throw new HttpError(409, "vault_not_set", "Set the secrets password first");
    if (v.lockedUntil && new Date(v.lockedUntil) > deps.now()) throw new HttpError(423, "locked", "Too many attempts. Try again in 15 minutes.");
    if (!(await verifyPassword(password, v.hash))) {
      const failed = v.failed + 1;
      const lock = failed >= MAX_FAILURES;
      await saveVault(deps.db, { ...v, failed: lock ? 0 : failed, lockedUntil: lock ? new Date(deps.now().getTime() + LOCK_MINUTES * 60_000).toISOString() : null });
      await audit(deps, actor(admin.id, req.ip), lock ? "vault_locked_out" : "vault_unlock_failed");
      throw new HttpError(401, "bad_vault_password", "The secrets password is incorrect");
    }
    await saveVault(deps.db, { ...v, failed: 0, lockedUntil: null });
    await audit(deps, actor(admin.id, req.ip), "vault_unlocked");
    return { unlockedUntil: await unlock(req) };
  });

  app.post("/api/admin/vault/lock", async req => {
    requireStaff(req, "admin");
    await deps.db.update(authSessions).set({ vaultUntil: null }).where(eq(authSessions.id, req.auth!.sessionId));
    return { ok: true };
  });

  app.post("/api/admin/vault/password", limited, async req => {
    const admin = await requireUnlocked(req);
    const body = z.object({ current: z.string(), next: vaultPassword }).parse(req.body);
    const v = await getVault(deps.db);
    if (!v || !(await verifyPassword(body.current, v.hash))) throw new HttpError(401, "bad_vault_password", "The current secrets password is incorrect");
    await refuseBreached(deps.breachCheck, body.next, req.log);
    if (await verifyPassword(body.next, admin.passwordHash)) throw new HttpError(400, "same_as_sign_in", "Use a different password from your sign-in password");
    await saveVault(deps.db, { hash: await hashPassword(body.next), failed: 0, lockedUntil: null });
    await audit(deps, actor(admin.id, req.ip), "vault_password_changed");
    return { ok: true };
  });

  app.get("/api/admin/secrets", async req => {
    await requireUnlocked(req);
    const names = new Map((await deps.db.select({ id: staff.id, n: staff.nameEn }).from(staff)).map(s => [s.id, s.n]));
    return (await deps.secrets.list()).map(s => ({ ...s, updatedByName: s.updatedBy ? names.get(s.updatedBy) ?? null : null }));
  });

  app.post<{ Params: { name: string } }>("/api/admin/secrets/:name/reveal", async req => {
    const admin = await requireUnlocked(req);
    const value = await deps.secrets.reveal(req.params.name);
    if (value === undefined) throw new HttpError(404, "not_found");
    await audit(deps, actor(admin.id, req.ip), "secret_revealed", req.params.name);
    return { value };
  });

  app.put<{ Params: { name: string } }>("/api/admin/secrets/:name", async req => {
    const admin = await requireUnlocked(req);
    const body = z.object({
      value: z.string().trim().min(1, "Enter a value"),
      description: z.string().trim().max(300).optional(),
      isSecret: z.boolean().optional(),
      service: z.string().max(40).optional()
    }).parse(req.body);
    const problem = deps.secrets.validate(req.params.name, body.value);
    if (problem) throw new HttpError(400, problem);
    const current = (await deps.secrets.list()).find(s => s.name === req.params.name && s.source === "saved");
    // A new custom secret may be filed under a service the admin added; an edited one stays where it is.
    let serviceId = current && current.service !== "custom" ? current.service : null;
    if (!current && body.service && !deps.secrets.isKnown(req.params.name)) {
      const svc = await deps.secrets.service(body.service);
      if (!svc || svc.builtIn) throw new HttpError(404, "service_not_found", "That service no longer exists");
      serviceId = svc.id;
    }
    await deps.secrets.set(req.params.name, body.value, { description: body.description || null, isSecret: body.isSecret, serviceId, by: admin.id, now: deps.now() });
    const existed = !!current;
    await audit(deps, actor(admin.id, req.ip), existed ? "secret_changed" : "secret_added", req.params.name);
    await alertEmrChange(req.params.name);
    return { ok: true };
  });

  app.delete<{ Params: { name: string } }>("/api/admin/secrets/:name", async req => {
    const admin = await requireUnlocked(req);
    await deps.secrets.remove(req.params.name);
    await audit(deps, actor(admin.id, req.ip), deps.secrets.isKnown(req.params.name) ? "secret_cleared" : "secret_deleted", req.params.name);
    await alertEmrChange(req.params.name);
    return { ok: true };
  });

  // ---- services: the on/off switch per service, connection tests, and services the admin adds ----

  const serviceBody = z.object({
    name: z.string().trim().min(1, "Enter a name").max(80),
    description: z.string().trim().max(300).optional(),
    address: z.string().trim().max(2000).optional()
  });

  async function findService(id: string) {
    const svc = await deps.secrets.service(id);
    if (!svc) throw new HttpError(404, "service_not_found", "That service no longer exists");
    return svc;
  }

  app.get("/api/admin/services", async req => {
    await requireUnlocked(req);
    const names = new Map((await deps.db.select({ id: staff.id, n: staff.nameEn }).from(staff)).map(s => [s.id, s.n]));
    // Finished chats waiting for the EMR, so the admin sees what turning it off holds back.
    const waiting = (await deps.db.select({ id: chatSessions.id }).from(chatSessions).where(eq(chatSessions.status, "locked"))).length;
    return (await deps.secrets.services()).map(s => ({
      ...s, updatedByName: s.updatedBy ? names.get(s.updatedBy) ?? null : null, ...(s.id === "emr" ? { waiting } : {})
    }));
  });

  app.post("/api/admin/services", async req => {
    const admin = await requireUnlocked(req);
    const body = serviceBody.parse(req.body);
    if (body.address && serviceAddressProblem(body.address)) throw new HttpError(400, "bad_url");
    const id = await deps.secrets.addService(body, { by: admin.id, now: deps.now() });
    await audit(deps, actor(admin.id, req.ip), "service_added", body.name);
    return { id };
  });

  app.put<{ Params: { id: string } }>("/api/admin/services/:id", async req => {
    const admin = await requireUnlocked(req);
    const svc = await findService(req.params.id);
    if (svc.builtIn) throw new HttpError(400, "built_in_service", "The app's own services can't be renamed or deleted, only switched off");
    const body = serviceBody.parse(req.body);
    if (body.address && serviceAddressProblem(body.address)) throw new HttpError(400, "bad_url");
    await deps.secrets.updateService(svc.id, body, { by: admin.id, now: deps.now() });
    await audit(deps, actor(admin.id, req.ip), "service_changed", body.name);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/services/:id", async req => {
    const admin = await requireUnlocked(req);
    const svc = await findService(req.params.id);
    if (svc.builtIn) throw new HttpError(400, "built_in_service", "The app's own services can't be renamed or deleted, only switched off");
    const removed = await deps.secrets.removeService(svc.id);
    await audit(deps, actor(admin.id, req.ip), "service_deleted", svc.name, { secretsRemoved: removed });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/admin/services/:id/enabled", async req => {
    const admin = await requireUnlocked(req);
    const svc = await findService(req.params.id);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    if (svc.enabled === enabled) return { ok: true };
    await deps.secrets.setEnabled(svc.id, enabled, { by: admin.id, now: deps.now() });
    await audit(deps, actor(admin.id, req.ip), enabled ? "service_turned_on" : "service_turned_off", svc.builtIn ? svc.id : svc.name);
    if (svc.id === "emr") {
      // Switching the EMR changes where every chat goes, so all admins hear about it, as for a changed EMR setting.
      await emailAdmins(enabled ? "The EMR connection was turned back on" : "The EMR connection was turned off",
        enabled
          ? "The EMR connection in Vwelfare Connect was turned back on. Finished chats that were waiting are being sent now."
          : "The EMR connection in Vwelfare Connect was turned off. Patient lookups and past chats can't be opened, and finished chats wait safely on the platform until it's turned back on. If you didn't expect this, sign in and check the activity log.");
    }
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/admin/services/:id/test", async req => {
    const admin = await requireUnlocked(req);
    const svc = await findService(req.params.id);
    const production = deps.config.production;
    let result: ProbeResult & { message?: string };
    switch (svc.id) {
      case "emr": {
        const r = await deps.emr.testConnection();
        result = r.ok ? { ok: true, result: "emr_ok" } : { ok: false, result: "emr_failed", message: r.message };
        break;
      }
      case "sms": result = await probeHttp(await deps.secrets.get("SMS_API_URL"), production); break;
      case "scanner": result = await probeHttp(await deps.secrets.get("MALWARE_SCANNER_URL"), production); break;
      // A real email to the admin's own sign-in address: the only way to know the key and send-from domain work.
      case "email": result = deps.notifier.testEmail ? await deps.notifier.testEmail(admin.email) : { ok: false, result: "email_not_set" }; break;
      default: result = await probeHttp(svc.address ?? undefined, production);
    }
    await audit(deps, actor(admin.id, req.ip), svc.id === "emr" ? "emr_connection_tested" : "service_tested", svc.builtIn ? svc.id : svc.name, { ok: result.ok });
    return result;
  });
}
