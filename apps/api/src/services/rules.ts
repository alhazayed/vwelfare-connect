import { z } from "zod";
import { eq } from "drizzle-orm";
import { settings } from "../db/schema.ts";
import type { Deps } from "../deps.ts";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const phone = z.string().trim().max(20).regex(/^[\d+ ]*$/);

export const rulesSchema = z.object({
  remindHours: z.number().int().min(1).max(167),
  autoFinishHours: z.number().int().min(2).max(168),
  emergencyNumber: phone,
  crisisLineNumber: phone,
  // 0 = Sunday … 6 = Saturday, in the center's time zone.
  workingHours: z.object({ days: z.array(z.number().int().min(0).max(6)).max(7), start: hhmm, end: hhmm })
}).refine(r => r.remindHours < r.autoFinishHours, { message: "The reminder must come before the automatic finish", path: ["remindHours"] });

export type Rules = z.infer<typeof rulesSchema>;

// Defaults until the admin saves the chat rules. Working days are an assumption (Sunday–Thursday): confirm them.
export const DEFAULT_RULES: Rules = {
  remindHours: 20,
  autoFinishHours: 24,
  emergencyNumber: "",
  crisisLineNumber: "",
  workingHours: { days: [0, 1, 2, 3, 4], start: "08:00", end: "16:00" }
};

export async function getRules(deps: Pick<Deps, "db" | "config">): Promise<Rules> {
  const row = await deps.db.query.settings.findFirst({ where: eq(settings.key, "rules") });
  const rules = row ? { ...DEFAULT_RULES, ...(row.value as Partial<Rules>) } : DEFAULT_RULES;
  // Patients must always have a number to call: fall back to the national emergency number from the environment.
  return { ...rules, emergencyNumber: rules.emergencyNumber || deps.config.EMERGENCY_NUMBER || "" };
}

export async function saveRules(deps: Pick<Deps, "db">, rules: Rules) {
  await deps.db.insert(settings).values({ key: "rules", value: rules })
    .onConflictDoUpdate({ target: settings.key, set: { value: rules } });
}
