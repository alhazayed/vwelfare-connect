import { join } from "node:path";
import { loadConfig, type Config } from "./config.ts";
import { openDb } from "./db/client.ts";
import { FieldCipher } from "./lib/crypto.ts";
import { EncryptedDiskStore, noScan } from "./lib/files.ts";
import { EmrClient, EmrUnavailable } from "./emr/client.ts";
import { ConsoleNotifier } from "./lib/notify.ts";
import { Hub } from "./realtime.ts";
import { emrUrlProblem, SecretStore } from "./services/secrets.ts";
import type { Deps } from "./deps.ts";

export function emrFromSecrets(secrets: SecretStore, config: Config) {
  return new EmrClient(async () => {
    const baseUrl = (await secrets.get("EMR_BASE_URL")) ?? "";
    // Checked on every call too, so an address saved before the allow-list existed is never used.
    if (emrUrlProblem(baseUrl, config)) throw new EmrUnavailable("The EMR address isn't on the allowed list (EMR_ALLOWED_HOSTS)");
    return {
      baseUrl,
      clientId: (await secrets.get("EMR_CLIENT_ID")) ?? "",
      clientSecret: (await secrets.get("EMR_CLIENT_SECRET")) ?? ""
    };
  });
}

export async function createDeps(config: Config = loadConfig()): Promise<{ deps: Deps; close: () => Promise<void> }> {
  const { db, close } = await openDb({ databaseUrl: config.DATABASE_URL, dataDir: config.dataDir });
  const cipher = new FieldCipher(config.FIELD_ENCRYPTION_KEY);
  const secrets = new SecretStore(db, cipher, config);
  const deps: Deps = {
    db,
    config,
    cipher,
    secrets,
    files: new EncryptedDiskStore(join(config.dataDir, "files"), cipher),
    scanner: noScan,
    emr: emrFromSecrets(secrets, config),
    notifier: new ConsoleNotifier(),
    hub: new Hub(),
    now: () => new Date()
  };
  return { deps, close };
}
