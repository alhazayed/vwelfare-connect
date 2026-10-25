import type { Db } from "./db/client.ts";
import type { Config } from "./config.ts";
import type { FieldCipher } from "./lib/crypto.ts";
import type { FileStore, Scanner } from "./lib/files.ts";
import type { EmrClient } from "./emr/client.ts";
import type { Notifier } from "./lib/notify.ts";
import type { Hub } from "./realtime.ts";
import type { BreachCheck } from "./lib/passwords.ts";
import type { SecretStore } from "./services/secrets.ts";

export type Deps = {
  db: Db;
  config: Config;
  cipher: FieldCipher;
  secrets: SecretStore;
  files: FileStore;
  scanner: Scanner;
  emr: EmrClient;
  notifier: Notifier;
  hub: Hub;
  breachCheck: BreachCheck;
  now: () => Date;
};

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}
