import { join } from "node:path";
import { loadConfig, type Config } from "./config.ts";
import { openDb } from "./db/client.ts";
import { FieldCipher } from "./lib/crypto.ts";
import { EncryptedDiskStore, noScan } from "./lib/files.ts";
import { EmrClient } from "./emr/client.ts";
import { ConsoleNotifier } from "./lib/notify.ts";
import { Hub } from "./realtime.ts";
import type { Deps } from "./deps.ts";

export async function createDeps(config: Config = loadConfig()): Promise<{ deps: Deps; close: () => Promise<void> }> {
  const { db, close } = await openDb({ databaseUrl: config.DATABASE_URL, dataDir: config.dataDir });
  const cipher = new FieldCipher(config.FIELD_ENCRYPTION_KEY);
  const deps: Deps = {
    db,
    config,
    cipher,
    files: new EncryptedDiskStore(join(config.dataDir, "files"), cipher),
    scanner: noScan,
    emr: new EmrClient(config.EMR_BASE_URL, config.EMR_CLIENT_ID, config.EMR_CLIENT_SECRET),
    notifier: new ConsoleNotifier(),
    hub: new Hub(),
    now: () => new Date()
  };
  return { deps, close };
}
