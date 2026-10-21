// One-time local setup: creates .env with random secrets if it doesn't exist yet.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const target = new URL("../.env", import.meta.url);
if (existsSync(target)) {
  console.log(".env already exists; leaving it unchanged.");
} else {
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const env = example
    .replace(/^FIELD_ENCRYPTION_KEY=.*$/m, `FIELD_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`)
    .replace(/^CENTER_TIMEZONE=.*$/m, `CENTER_TIMEZONE=${tz}`);
  writeFileSync(target, env);
  console.log(`Created .env (time zone ${tz}).`);
}
console.log("Next: npm run seed, then npm run dev");
