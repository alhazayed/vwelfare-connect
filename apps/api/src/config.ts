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
  CENTER_TIMEZONE: z.string().optional().transform(v => v || Intl.DateTimeFormat().resolvedOptions().timeZone),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
  EMR_BASE_URL: z.string().optional().transform(v => v || undefined).pipe(z.string().url().optional()),
  // On Vercel, the binding to the internal mock-emr service injects this. Never used in production.
  MOCK_EMR_URL: z.string().optional().transform(v => v || undefined).pipe(z.string().url().optional()),
  // Vercel Cron sends it as a bearer token when it calls the worker (GET /api/internal/worker).
  CRON_SECRET: z.string().optional().transform(v => v || undefined),
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
  EMR_CLIENT_ID: z.string().default("vwelfare-connect"),
  EMR_CLIENT_SECRET: z.string().default("dev-secret"),
  SEED_ADMIN_EMAIL: z.string().email().default("admin@vwelfare.example")
});

export type Config = Omit<z.infer<typeof schema>, "EMR_BASE_URL"> & { EMR_BASE_URL: string; dataDir: string };

export function loadConfig(overrides: Partial<Record<keyof z.input<typeof schema>, string>> = {}): Config {
  const parsed = schema.parse({ ...process.env, ...overrides });
  const production = parsed.VERCEL_ENV === "production";
  if (parsed.VERCEL) {
    // Functions don't keep their disk, so the built-in PGlite database would be lost.
    if (!parsed.DATABASE_URL) throw new Error("DATABASE_URL must be set on Vercel: the built-in database needs a disk that functions don't keep.");
    if (!parsed.CRON_SECRET) throw new Error("CRON_SECRET must be set on Vercel: the scheduled worker (reminders, automatic finishes, EMR retries) needs it.");
  }
  if (production && !parsed.EMR_BASE_URL) throw new Error("EMR_BASE_URL must be set in production. The mock EMR is never used there.");
  const EMR_BASE_URL = parsed.EMR_BASE_URL ?? (production ? undefined : parsed.MOCK_EMR_URL) ?? "http://localhost:4100";
  return { ...parsed, EMR_BASE_URL, dataDir: resolve(repoRoot, parsed.DATA_DIR) };
}
