// The secrets list: credentials and addresses of the services the app connects to.
// Saved values are encrypted with the server key and win over the .env file.
// The vault password only controls who can see and change them in the admin screen;
// the server itself reads them without it, so the EMR connection keeps working when nobody is signed in.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { integrations, secrets, settings } from "../db/schema.ts";
import type { Db } from "../db/client.ts";
import type { Config } from "../config.ts";
import type { FieldCipher } from "../lib/crypto.ts";

export type Group = "emr" | "sms" | "email" | "scanner" | "custom";

/** The services the app knows about. Only the EMR is connected; the others are saved for when their integration is built. */
export const BUILT_IN = ["emr", "sms", "email", "scanner"] as const;
export type BuiltIn = typeof BUILT_IN[number];
const isBuiltIn = (id: string): id is BuiltIn => (BUILT_IN as readonly string[]).includes(id);

export type ServiceInput = { name: string; description?: string | null; address?: string | null };

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

/**
 * Chats and patient lookups go wherever EMR_BASE_URL points, so a saved address must be on the
 * EMR_ALLOWED_HOSTS list from the server's environment (and use https in production).
 */
export function emrUrlProblem(value: string, config: Pick<Config, "EMR_ALLOWED_HOSTS" | "production">): "bad_url" | "emr_host_not_allowed" | "emr_https_required" | null {
  let u: URL;
  try { u = new URL(value); } catch { return "bad_url"; }
  if (!["http:", "https:"].includes(u.protocol)) return "bad_url";
  if (config.production && u.protocol !== "https:") return "emr_https_required";
  const host = u.host.toLowerCase(), hostname = u.hostname.toLowerCase();
  return config.EMR_ALLOWED_HOSTS.some(h => h === host || h === hostname) ? null : "emr_host_not_allowed";
}

/** An address the admin gives a service they add: http(s), no user name or password inside it. */
export function serviceAddressProblem(value: string): "bad_url" | null {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? null : "bad_url";
  } catch { return "bad_url"; }
}

type IntegrationRow = typeof integrations.$inferSelect;

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
        // Which service card the setting is shown under: the built-in group, a service the admin added, or "custom" for loose secrets.
        service: k?.group ?? saved?.row.serviceId ?? "custom",
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
    if (name === "EMR_BASE_URL") return emrUrlProblem(value, this.config);
    if (k?.kind === "url") {
      try { const u = new URL(value); if (!["http:", "https:"].includes(u.protocol)) return "bad_url"; } catch { return "bad_url"; }
    }
    if (k?.kind === "port" && !/^\d{1,5}$/.test(value)) return "bad_port";
    return null;
  }

  async set(name: string, value: string, opts: { description?: string | null; isSecret?: boolean; serviceId?: string | null; by: string; now: Date }) {
    const k = known(name);
    const row = {
      name,
      valueEnc: this.cipher.encrypt(value),
      description: opts.description ?? null,
      isSecret: k ? k.isSecret : opts.isSecret ?? true,
      serviceId: k ? null : opts.serviceId ?? null,
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

  // ---- services: switch on and off, and the services the admin adds ----

  // Not cached: on a hosted deployment several server instances run at once, and switching the EMR off must reach all of them.
  private async serviceRows(): Promise<Map<string, IntegrationRow>> {
    return new Map((await this.db.select().from(integrations)).map(r => [r.id, r]));
  }

  /** A built-in service is on until the admin turns it off; an added service is on while it exists and is switched on. */
  async isEnabled(id: string): Promise<boolean> {
    const row = await this.db.query.integrations.findFirst({ where: eq(integrations.id, id) });
    return row ? row.enabled : isBuiltIn(id);
  }

  async services() {
    const rows = await this.serviceRows();
    const added = [...rows.values()].filter(r => !r.builtIn).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return [
      ...BUILT_IN.map(id => {
        const r = rows.get(id);
        return { id, builtIn: true, connected: id === "emr", name: null, description: null, address: null, enabled: r?.enabled ?? true, updatedAt: r?.updatedAt ?? null, updatedBy: r?.updatedBy ?? null };
      }),
      ...added.map(r => ({
        id: r.id, builtIn: false, connected: false, name: r.name, description: r.description,
        address: r.addressEnc ? this.cipher.decrypt(r.addressEnc) : null, enabled: r.enabled, updatedAt: r.updatedAt, updatedBy: r.updatedBy
      }))
    ];
  }

  async service(id: string) {
    return (await this.services()).find(s => s.id === id) ?? null;
  }

  async setEnabled(id: string, enabled: boolean, opts: { by: string; now: Date }) {
    const set = { enabled, updatedAt: opts.now, updatedBy: opts.by };
    await this.db.insert(integrations).values({ id, builtIn: isBuiltIn(id), ...set }).onConflictDoUpdate({ target: integrations.id, set });
  }

  async addService(input: ServiceInput, opts: { by: string; now: Date }): Promise<string> {
    const id = `svc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await this.db.insert(integrations).values({ id, builtIn: false, ...this.serviceFields(input), enabled: true, updatedAt: opts.now, updatedBy: opts.by });
    return id;
  }

  async updateService(id: string, input: ServiceInput, opts: { by: string; now: Date }) {
    await this.db.update(integrations).set({ ...this.serviceFields(input), updatedAt: opts.now, updatedBy: opts.by }).where(eq(integrations.id, id));
  }

  /** Removes an added service together with every secret saved under it. */
  async removeService(id: string): Promise<string[]> {
    const names = await this.db.transaction(async tx => {
      const gone = await tx.delete(secrets).where(eq(secrets.serviceId, id)).returning({ name: secrets.name });
      await tx.delete(integrations).where(eq(integrations.id, id));
      return gone.map(g => g.name);
    });
    this.cache = null;
    return names;
  }

  private serviceFields(input: ServiceInput) {
    return {
      name: input.name,
      description: input.description || null,
      addressEnc: input.address ? this.cipher.encrypt(input.address) : null
    };
  }
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
