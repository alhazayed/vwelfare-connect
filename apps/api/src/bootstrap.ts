import { join } from "node:path";
import { loadConfig, type Config } from "./config.ts";
import { openDb } from "./db/client.ts";
import { FieldCipher } from "./lib/crypto.ts";
import { EncryptedDiskStore, noScan } from "./lib/files.ts";
import { EmrClient } from "./emr/client.ts";
import { ConsoleNotifier } from "./lib/notify.ts";
import { Hub } from "./realtime.ts";
import { SecretStore } from "./services/secrets.ts";
import type { Deps } from "./deps.ts";

export function emrFromSecrets(secrets: SecretStore) {
  return new EmrClient(async () => ({
    baseUrl: (await secrets.get("EMR_BASE_URL")) ?? "",
    clientId: (await secrets.get("EMR_CLIENT_ID")) ?? "",
    clientSecret: (await secrets.get("EMR_CLIENT_SECRET")) ?? ""
  }));
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
    emr: emrFromSecrets(secrets),
    notifier: new ConsoleNotifier(),
    hub: new Hub(),
    now: () => new Date()
  };
  return { deps, close };
}
