import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { auditLog, authSessions, chatSessions, invitations, providerPatients, staff } from "../db/schema.ts";
import { newToken, sha256 } from "../lib/crypto.ts";
import { HttpError, type Deps } from "../deps.ts";
import { requireStaff } from "../auth.ts";
import { audit } from "../services/audit.ts";
import { getRules, rulesSchema, saveRules } from "../services/rules.ts";
import { finishSession } from "../services/chat.ts";

const INVITE_HOURS = 72;

export function adminRoutes(app: FastifyInstance, deps: Deps) {
  app.get("/api/admin/providers", async req => {
    requireStaff(req, "admin");
    const rows = await deps.db.select({
      id: staff.id, email: staff.email, nameEn: staff.nameEn, nameAr: staff.nameAr, specialtyEn: staff.specialtyEn, specialtyAr: staff.specialtyAr,
      emrStaffId: staff.emrStaffId, active: staff.active, mfaEnabled: staff.mfaEnabled, hasPassword: sql<boolean>`${staff.passwordHash} is not null`,
      patients: sql<number>`(select count(*)::int from ${providerPatients} where ${providerPatients.providerId} = ${staff.id})`,
      openChats: sql<number>`(select count(*)::int from ${chatSessions} where ${chatSessions.providerId} = ${staff.id} and ${chatSessions.status} = 'open')`
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
      `Set your password and sign-in app here (link valid for ${INVITE_HOURS} hours): ${deps.config.APP_BASE_URL}/invite/staff/${token}`);
    await audit(deps, { type: "admin", id: admin.id, ip: req.ip }, "provider_created", p!.id);
    return { id: p!.id };
  });

  app.get<{ Params: { id: string } }>("/api/admin/providers/:id/impact", async req => {
    requireStaff(req, "admin");
    const [row] = await deps.db.select({
      openChats: sql<number>`(select count(*)::int from ${chatSessions} where ${chatSessions.providerId} = ${req.params.id} and ${chatSessions.status} = 'open')`,
      patients: sql<number>`(select count(*)::int from ${providerPatients} where ${providerPatients.providerId} = ${req.params.id})`
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
