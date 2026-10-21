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
  EMR_BASE_URL: z.string().url().default("http://localhost:4100"),
  EMR_CLIENT_ID: z.string().default("vwelfare-connect"),
  EMR_CLIENT_SECRET: z.string().default("dev-secret"),
  SEED_ADMIN_EMAIL: z.string().email().default("admin@vwelfare.example")
});

export type Config = z.infer<typeof schema> & { dataDir: string };

export function loadConfig(overrides: Partial<Record<keyof z.input<typeof schema>, string>> = {}): Config {
  const parsed = schema.parse({ ...process.env, ...overrides });
  return { ...parsed, dataDir: resolve(repoRoot, parsed.DATA_DIR) };
}
