import { auditLog } from "../db/schema.ts";
import type { Deps } from "../deps.ts";

export type Actor = { type: "admin" | "provider" | "patient" | "system"; id?: string | null; ip?: string | null };

/** Records who did what. Never pass message text or patient names in `details`. */
export async function audit(deps: Pick<Deps, "db" | "now">, actor: Actor, action: string, target?: string | null, details?: Record<string, unknown>) {
  await deps.db.insert(auditLog).values({
    at: deps.now(),
    actorType: actor.type,
    actorId: actor.id ?? null,
    action,
    target: target ?? null,
    details: details ?? null,
    ip: actor.ip ?? null
  });
}
