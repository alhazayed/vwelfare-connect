// Removes the secrets password, for when it is forgotten. Run on the server by IT; it can't be done from the app.
// Saved secrets are kept. The next super admin to open the Secrets tab sets a new password.
// Usage: npm run vault:reset -- --confirm
import { createDeps } from "../bootstrap.ts";
import { clearVault } from "../services/secrets.ts";
import { audit } from "../services/audit.ts";

if (!process.argv.includes("--confirm")) {
  console.error("This removes the secrets password. Saved secrets are kept. Run again with --confirm to go ahead.");
  process.exit(1);
}
const { deps, close } = await createDeps();
await clearVault(deps.db);
await audit(deps, { type: "system" }, "vault_password_reset");
console.log("Secrets password removed. A super admin can now set a new one in the Secrets tab.");
await close();
