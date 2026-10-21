// The secrets list: credentials and addresses of the services the app connects to.
// Saved values are encrypted with the server key and win over the .env file.
// The vault password only controls who can see and change them in the admin screen;
// the server itself reads them without it, so the EMR connection keeps working when nobody is signed in.
import { eq } from "drizzle-orm";
import { secrets, settings } from "../db/schema.ts";
import type { Db } from "../db/client.ts";
import type { Config } from "../config.ts";
import type { FieldCipher } from "../lib/crypto.ts";

export type Group = "emr" | "sms" | "email" | "scanner" | "custom";

/** Settings the app knows about. `connected: false` = saved for later; the integration isn't built yet. */
export const CATALOG: Array<{ name: string; group: Group; isSecret: boolean; connected: boolean; kind?: "url" | "port" }> = [
  { name: "EMR_BASE_URL", group: "emr", isSecret: false, connected: true, kind: "url" },
  { name: "EMR_CLIENT_ID", group: "emr", isSecret: false, connected: true },
  { name: "EMR_CLIENT_SECRET", group: "emr", isSecret: true, connected: true },
  { name: "SMS_API_URL", group: "sms", isSecret: false, connected: false, kind: "url" },
  { name: "SMS_API_KEY", group: "sms", isSecret: true, connected: false },
  { name: "SMS_SENDER_ID", group: "sms", isSecret: false, connected: false },
  { name: "SMTP_HOST", group: "email", isSecret: false, connected: false },
  { name: "SMTP_PORT", group: "email", isSecret: false, connected: false, kind: "port" },
  { name: "SMTP_USERNAME", group: "email", isSecret: false, connected: false },
  { name: "SMTP_PASSWORD", group: "email", isSecret: true, connected: false },
  { name: "EMAIL_FROM", group: "email", isSecret: false, connected: false },
  { name: "MALWARE_SCANNER_URL", group: "scanner", isSecret: false, connected: false, kind: "url" },
  { name: "MALWARE_SCANNER_API_KEY", group: "scanner", isSecret: true, connected: false }
];

export const CUSTOM_NAME = /^[A-Z][A-Z0-9_]{2,63}$/;
const known = (name: string) => CATALOG.find(c => c.name === name);

export class SecretStore {
  private cache: Map<string, { value: string; row: typeof secrets.$inferSelect }> | null = null;

  constructor(private db: Db, private cipher: FieldCipher, private config: Config) {}

  private async rows() {
    if (!this.cache) {
      const all = await this.db.select().from(secrets);
      this.cache = new Map(all.map(r => [r.name, { value: this.cipher.decrypt(r.valueEnc), row: r }]));
    }
    return this.cache;
  }

  private envValue(name: string): string | undefined {
    const fromConfig = (this.config as unknown as Record<string, unknown>)[name];
    const v = typeof fromConfig === "string" ? fromConfig : process.env[name];
    return v || undefined;
  }

  /** Saved value first, then the .env file. */
  async get(name: string): Promise<string | undefined> {
    return (await this.rows()).get(name)?.value ?? this.envValue(name);
  }

  /** Everything for the admin screen. Secret values are left out; they are fetched one at a time with `reveal`. */
  async list() {
    const rows = await this.rows();
    const names = [...CATALOG.map(c => c.name), ...[...rows.keys()].filter(n => !known(n)).sort()];
    return names.map(name => {
      const k = known(name);
      const saved = rows.get(name);
      const env = this.envValue(name);
      const isSecret = k ? k.isSecret : saved?.row.isSecret ?? true;
      const value = saved?.value ?? env;
      return {
        name,
        group: (k?.group ?? "custom") as Group,
        known: !!k,
        connected: k?.connected ?? false,
        isSecret,
        source: saved ? "saved" as const : env ? "env" as const : "none" as const,
        value: isSecret ? null : value ?? null,
        description: saved?.row.description ?? null,
        updatedAt: saved?.row.updatedAt ?? null,
        updatedBy: saved?.row.updatedBy ?? null
      };
    });
  }

  async reveal(name: string): Promise<string | undefined> {
    return this.get(name);
  }

  validate(name: string, value: string): string | null {
    const k = known(name);
    if (!k && !CUSTOM_NAME.test(name)) return "bad_name";
    if (value.length > 4000) return "too_long";
    if (k?.kind === "url") {
      try { const u = new URL(value); if (!["http:", "https:"].includes(u.protocol)) return "bad_url"; } catch { return "bad_url"; }
    }
    if (k?.kind === "port" && !/^\d{1,5}$/.test(value)) return "bad_port";
    return null;
  }

  async set(name: string, value: string, opts: { description?: string | null; isSecret?: boolean; by: string; now: Date }) {
    const k = known(name);
    const row = {
      name,
      valueEnc: this.cipher.encrypt(value),
      description: opts.description ?? null,
      isSecret: k ? k.isSecret : opts.isSecret ?? true,
      updatedAt: opts.now,
      updatedBy: opts.by
    };
    await this.db.insert(secrets).values(row).onConflictDoUpdate({ target: secrets.name, set: row });
    this.cache = null;
  }

  /** Known settings fall back to the .env file; custom ones are removed. */
  async remove(name: string) {
    await this.db.delete(secrets).where(eq(secrets.name, name));
    this.cache = null;
  }

  isKnown(name: string) { return !!known(name); }
}

// ---- vault password (separate from the admin's sign-in password) ----

export type VaultState = { hash: string; failed: number; lockedUntil: string | null };

export async function getVault(db: Db): Promise<VaultState | null> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, "vault") });
  return (row?.value as VaultState | undefined) ?? null;
}

export async function saveVault(db: Db, v: VaultState) {
  await db.insert(settings).values({ key: "vault", value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v } });
}

export async function clearVault(db: Db) {
  await db.delete(settings).where(eq(settings.key, "vault"));
}
