import { z } from "zod";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
try { process.loadEnvFile(resolve(repoRoot, ".env")); } catch { /* no .env file: rely on the real environment */ }

const schema = z.object({
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().optional().transform(v => v || undefined),
  DATA_DIR: z.string().default("./data"),
  FIELD_ENCRYPTION_KEY: z.string().refine(v => Buffer.from(v, "base64").length === 32, "FIELD_ENCRYPTION_KEY must be 32 bytes, base64. Run npm run setup."),
  APP_BASE_URL: z.string().url().default("http://localhost:5173"),
  // The center is in Jordan. Vercel functions run in UTC, so the machine's own zone is never a safe default.
  CENTER_TIMEZONE: z.string().optional().transform(v => v || "Asia/Amman"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
  // Which proxies may set X-Forwarded-For (sign-in limits and the audit log use the client IP): addresses or CIDR
  // ranges, comma-separated. Default: only a proxy on the same machine, or every proxy on Vercel (its edge
  // replaces any X-Forwarded-For the visitor sends).
  TRUST_PROXY: z.string().optional().transform(v => v?.split(",").map(x => x.trim()).filter(Boolean)).transform(v => v?.length ? v : undefined),
  EMR_BASE_URL: z.string().optional().transform(v => v || undefined).pipe(z.string().url().optional()),
  // On Vercel, the binding to the internal mock-emr service injects this. Never used in production.
  MOCK_EMR_URL: z.string().optional().transform(v => v || undefined).pipe(z.string().url().optional()),
  // Vercel Cron sends it as a bearer token when it calls the worker (GET /api/internal/worker).
  CRON_SECRET: z.string().optional().transform(v => v || undefined),
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
  // "production" on the center's own servers (the container build in deploy/). On Vercel, VERCEL_ENV says it instead.
  APP_ENV: z.string().optional(),
  // Address the API listens on outside Vercel. The container sets 0.0.0.0 so the web container can reach it.
  API_HOST: z.string().default("127.0.0.1"),
  // Hosts the EMR address may point to, comma-separated (host or host:port). Empty = only the host of EMR_BASE_URL.
  // An EMR_BASE_URL saved in the admin's secrets list must match one of these, so it can't send chats elsewhere.
  EMR_ALLOWED_HOSTS: z.string().optional().transform(v => (v ?? "").split(",").map(h => h.trim().toLowerCase()).filter(Boolean)),
  EMR_CLIENT_ID: z.string().default("vwelfare-connect"),
  EMR_CLIENT_SECRET: z.string().default("dev-secret"),
  // The national emergency number (Jordan: 911). Patients see it whenever the admin hasn't saved one (or cleared it),
  // so the crisis panel never shows an empty number.
  EMERGENCY_NUMBER: z.string().trim().max(20).regex(/^[\d+ ]*$/, "EMERGENCY_NUMBER may only contain digits, spaces and +").optional().transform(v => v || "911"),
  SEED_ADMIN_EMAIL: z.string().email().default("admin@vwelfare.example"),
  // Preview deployments only: adds sample accounts with this password (see services/preview-seed.ts).
  PREVIEW_SEED_PASSWORD: z.string().optional().transform(v => v || undefined).pipe(z.string().min(12, "PREVIEW_SEED_PASSWORD must be at least 12 characters").optional())
});

export type Config = Omit<z.infer<typeof schema>, "EMR_BASE_URL" | "TRUST_PROXY"> & { EMR_BASE_URL: string; TRUST_PROXY: string[] | true; dataDir: string; production: boolean };

export function loadConfig(overrides: Partial<Record<keyof z.input<typeof schema>, string>> = {}): Config {
  const parsed = schema.parse({ ...process.env, ...overrides });
  const production = parsed.VERCEL_ENV === "production" || parsed.APP_ENV === "production";
  if (parsed.VERCEL) {
    // Functions don't keep their disk, so the built-in PGlite database would be lost.
    if (!parsed.DATABASE_URL) throw new Error("DATABASE_URL must be set on Vercel: the built-in database needs a disk that functions don't keep.");
    if (!parsed.CRON_SECRET) throw new Error("CRON_SECRET must be set on Vercel: the scheduled worker (reminders, automatic finishes, EMR retries) needs it.");
  }
  if (production && !parsed.EMR_BASE_URL) throw new Error("EMR_BASE_URL must be set in production. The mock EMR is never used there.");
  const EMR_BASE_URL = parsed.EMR_BASE_URL ?? (production ? undefined : parsed.MOCK_EMR_URL) ?? "http://localhost:4100";
  if (production && new URL(EMR_BASE_URL).protocol !== "https:") throw new Error("EMR_BASE_URL must use https in production.");
  // On the center's servers the database must be a real PostgreSQL with backups, not the built-in development one.
  if (production && !parsed.DATABASE_URL) throw new Error("DATABASE_URL must be set in production: the built-in database is for development only.");
  const EMR_ALLOWED_HOSTS = parsed.EMR_ALLOWED_HOSTS.length ? parsed.EMR_ALLOWED_HOSTS : [new URL(EMR_BASE_URL).host.toLowerCase()];
  const TRUST_PROXY = parsed.TRUST_PROXY ?? (parsed.VERCEL ? true : ["127.0.0.1", "::1"]);
  return { ...parsed, EMR_BASE_URL, EMR_ALLOWED_HOSTS, TRUST_PROXY, production, dataDir: resolve(repoRoot, parsed.DATA_DIR) };
}
