// Development helper: prints the current 6-digit sign-in code for an authenticator secret,
// so you don't need a phone while developing. Usage: npm run otp -- <secret>
import { currentCode, newMfaSecret } from "../lib/totp.ts";

const secret = process.argv[2];
if (!secret) { console.error("Usage: npm run otp -- <secret>   (the secret printed by npm run seed or shown on the sign-in app set-up screen)"); process.exit(1); }
console.log(currentCode(secret));
