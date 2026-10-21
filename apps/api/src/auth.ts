// Cookie sessions for staff and patients. Tokens are random; only their hash is stored.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, gt } from "drizzle-orm";
import { authSessions, patients, staff } from "./db/schema.ts";
import { newToken, sha256 } from "./lib/crypto.ts";
import { HttpError, type Deps } from "./deps.ts";

export const COOKIE = "vw_sid";
const IDLE_MINUTES = { staff: 15, patient: 30 } as const;

type StaffRow = typeof staff.$inferSelect;
type PatientRow = typeof patients.$inferSelect;

export type AuthInfo =
  | { kind: "staff"; sessionId: string; mfaOk: boolean; staff: StaffRow }
  | { kind: "patient"; sessionId: string; patient: PatientRow };

declare module "fastify" {
  interface FastifyRequest { auth: AuthInfo | null }
}

export async function startSession(deps: Deps, reply: FastifyReply, kind: "staff" | "patient", subjectId: string, mfaOk = false) {
  const token = newToken();
  const now = deps.now();
  await deps.db.insert(authSessions).values({
    tokenHash: sha256(token), kind, subjectId, mfaOk,
    createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + IDLE_MINUTES[kind] * 60_000)
  });
  reply.setCookie(COOKIE, token, { path: "/", httpOnly: true, sameSite: "strict", secure: deps.config.COOKIE_SECURE });
}

export async function endSession(deps: Deps, req: FastifyRequest, reply: FastifyReply) {
  if (req.auth) await deps.db.delete(authSessions).where(eq(authSessions.id, req.auth.sessionId));
  reply.clearCookie(COOKIE, { path: "/" });
}

export function registerAuth(app: FastifyInstance, deps: Deps) {
  app.decorateRequest("auth", null);

  // Mutating requests must carry a custom header: browsers won't send it cross-site without CORS approval.
  app.addHook("onRequest", async req => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.url.startsWith("/api/") && req.headers["x-vwelfare"] !== "1") {
      throw new HttpError(403, "missing_header", "Requests must come from the Vwelfare Connect app");
    }
  });

  app.addHook("onRequest", async req => {
    const token = req.cookies[COOKIE];
    if (!token) return;
    const now = deps.now();
    const row = await deps.db.query.authSessions.findFirst({ where: and(eq(authSessions.tokenHash, sha256(token)), gt(authSessions.expiresAt, now)) });
    if (!row) return;
    if (row.kind === "staff") {
      const s = await deps.db.query.staff.findFirst({ where: eq(staff.id, row.subjectId) });
      if (!s || !s.active) return;
      req.auth = { kind: "staff", sessionId: row.id, mfaOk: row.mfaOk, staff: s };
    } else {
      const p = await deps.db.query.patients.findFirst({ where: eq(patients.fileNumber, row.subjectId) });
      if (!p || p.status !== "active") return;
      req.auth = { kind: "patient", sessionId: row.id, patient: p };
    }
    // Sliding idle timeout.
    await deps.db.update(authSessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + IDLE_MINUTES[row.kind] * 60_000) })
      .where(eq(authSessions.id, row.id));
  });
}

export function requireStaff(req: FastifyRequest, role: "admin" | "provider"): StaffRow {
  const a = req.auth;
  if (!a || a.kind !== "staff" || !a.mfaOk) throw new HttpError(401, "not_signed_in");
  if (a.staff.role !== role) throw new HttpError(403, "forbidden");
  return a.staff;
}

export function requirePatient(req: FastifyRequest): PatientRow {
  const a = req.auth;
  if (!a || a.kind !== "patient") throw new HttpError(401, "not_signed_in");
  return a.patient;
}
