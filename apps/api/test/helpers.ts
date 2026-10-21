import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { buildMockEmr } from "@vwelfare/mock-emr/src/app.ts";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { openDb } from "../src/db/client.ts";
import { staff } from "../src/db/schema.ts";
import { FieldCipher, hashPassword } from "../src/lib/crypto.ts";
import { MemoryStore, noScan } from "../src/lib/files.ts";
import { ConsoleNotifier } from "../src/lib/notify.ts";
import { emrFromSecrets } from "../src/bootstrap.ts";
import { SecretStore } from "../src/services/secrets.ts";
import { Hub } from "../src/realtime.ts";
import type { Deps } from "../src/deps.ts";

export const PASSWORD = "correct-horse-battery";

export async function setup() {
  const emr = buildMockEmr({ clientId: "test-client", clientSecret: "test-secret" });
  await emr.app.listen({ port: 0, host: "127.0.0.1" });
  const addr = emr.app.server.address();
  const emrUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  const config = loadConfig({
    FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    CENTER_TIMEZONE: "UTC",
    DATABASE_URL: "",
    EMR_BASE_URL: emrUrl,
    EMR_CLIENT_ID: "test-client",
    EMR_CLIENT_SECRET: "test-secret",
    APP_BASE_URL: "http://app.test"
  });
  const { db, close } = await openDb({ dataDir: "memory" });
  const clock = { now: new Date("2026-10-21T09:00:00Z") }; // a Wednesday, inside default working hours
  const notifier = new ConsoleNotifier(() => {});
  const files = new MemoryStore();
  const cipher = new FieldCipher(config.FIELD_ENCRYPTION_KEY);
  const secrets = new SecretStore(db, cipher, config);
  const deps: Deps = {
    db, config, files, notifier, cipher, secrets,
    scanner: noScan,
    emr: emrFromSecrets(secrets),
    hub: new Hub(),
    now: () => clock.now
  };
  const app = await buildApp(deps);

  const mfaSecrets = new Map<string, string>();
  async function createStaff(role: "admin" | "provider", email: string, extra: Partial<typeof staff.$inferInsert> = {}) {
    const secret = authenticator.generateSecret();
    mfaSecrets.set(email, secret);
    const [row] = await db.insert(staff).values({
      role, email, nameEn: email.split("@")[0]!, passwordHash: await hashPassword(PASSWORD),
      mfaSecretEnc: deps.cipher.encrypt(secret), mfaEnabled: true, ...extra
    }).returning();
    return row!;
  }

  async function staffClient(email: string) {
    const c = new Client(app);
    await c.ok("POST", "/api/auth/staff/login", { email, password: PASSWORD });
    await c.ok("POST", "/api/auth/staff/mfa", { code: authenticator.generate(mfaSecrets.get(email)!) });
    return c;
  }

  return {
    app, deps, emr, clock, notifier, files, createStaff, staffClient, mfaSecrets,
    async teardown() { await app.close(); await emr.app.close(); await close(); }
  };
}

export class Client {
  cookie = "";
  constructor(private app: FastifyInstance) {}

  async req(method: string, url: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { "x-vwelfare": "1", ...extraHeaders };
    if (this.cookie) headers.cookie = this.cookie;
    const res = await this.app.inject({ method: method as "GET", url, headers, ...(body !== undefined ? { payload: body as object } : {}) });
    const set = res.headers["set-cookie"];
    const first = Array.isArray(set) ? set[0] : set;
    if (first) this.cookie = first.split(";")[0]!;
    return res;
  }

  async ok<T = any>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await this.req(method, url, body);
    if (res.statusCode >= 300) throw new Error(`${method} ${url} → ${res.statusCode}: ${res.body}`);
    return res.json() as T;
  }

  async upload(url: string, fileName: string, content: Buffer, mime = "application/pdf") {
    const boundary = "----vwtest" + Math.random().toString(16).slice(2);
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    return this.req("POST", url, payload, { "content-type": `multipart/form-data; boundary=${boundary}` });
  }
}

export function inviteToken(text: string) {
  const m = text.match(/\/invite\/(?:patient|staff)\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`No invitation link in: ${text}`);
  return m[1]!;
}
