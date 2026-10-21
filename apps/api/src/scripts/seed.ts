// Development data: an admin, two providers and two patients that match the mock EMR.
// Prints the sign-in details once. Safe to run again: it does nothing if the admin already exists.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";
import { createDeps } from "../bootstrap.ts";
import { invitations, patients, providerPatients, staff } from "../db/schema.ts";
import { hashPassword, newToken, sha256 } from "../lib/crypto.ts";

if (process.env.NODE_ENV === "production") throw new Error("The seed script is for development only.");

const { deps, close } = await createDeps();
const { db, config, cipher } = deps;
const pw = () => `vw-${randomBytes(6).toString("base64url")}`;

if (await db.query.staff.findFirst({ where: eq(staff.email, config.SEED_ADMIN_EMAIL) })) {
  console.log("Seed data already exists. Delete the data folder to start over.");
} else {
  const adminPw = pw(), saraPw = pw(), omarPw = pw(), laylaPw = pw();
  // Staff are enrolled in MFA already so you can sign in with `npm run otp -- <secret>`.
  const adminOtp = authenticator.generateSecret(), saraOtp = authenticator.generateSecret(), omarOtp = authenticator.generateSecret();
  const mfa = (secret: string) => ({ mfaSecretEnc: cipher.encrypt(secret), mfaEnabled: true });
  await db.insert(staff).values({ role: "admin", email: config.SEED_ADMIN_EMAIL, nameEn: "Vwelfare Admin", nameAr: "مشرف Vwelfare", passwordHash: await hashPassword(adminPw), ...mfa(adminOtp) });
  const [sara] = await db.insert(staff).values({
    role: "provider", email: "s.almansour@vwelfare.example", nameEn: "Dr. Sara Al-Mansour", nameAr: "د. سارة المنصور",
    specialtyEn: "Psychiatrist", specialtyAr: "طبيبة نفسية", emrStaffId: "ST-0193", passwordHash: await hashPassword(saraPw), ...mfa(saraOtp)
  }).returning();
  const [omar] = await db.insert(staff).values({
    role: "provider", email: "o.khalil@vwelfare.example", nameEn: "Omar Khalil", nameAr: "عمر خليل",
    specialtyEn: "Clinical psychologist", specialtyAr: "أخصائي نفسي إكلينيكي", emrStaffId: "ST-0207", passwordHash: await hashPassword(omarPw), ...mfa(omarOtp)
  }).returning();

  await db.insert(patients).values({ fileNumber: "10482", username: "layla.h", passwordHash: await hashPassword(laylaPw), status: "active", invitedBy: sara!.id, mobileEnc: cipher.encrypt("+000000004417"), termsAcceptedAt: new Date() });
  await db.insert(providerPatients).values([{ providerId: sara!.id, fileNumber: "10482" }, { providerId: omar!.id, fileNumber: "10482" }]);

  const token = newToken();
  await db.insert(patients).values({ fileNumber: "10517", status: "invited", invitedBy: sara!.id, mobileEnc: cipher.encrypt("+000000005172") });
  await db.insert(providerPatients).values({ providerId: sara!.id, fileNumber: "10517" });
  await db.insert(invitations).values({ kind: "patient", subject: "10517", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 72 * 3600_000) });

  const summary = `
Development accounts (also saved to data/dev-accounts.txt, which git ignores):

  Role          Sign-in                        Password       Authenticator secret
  Super admin   ${config.SEED_ADMIN_EMAIL.padEnd(30)} ${adminPw.padEnd(14)} ${adminOtp}
  Provider      s.almansour@vwelfare.example   ${saraPw.padEnd(14)} ${saraOtp}
  Provider      o.khalil@vwelfare.example      ${omarPw.padEnd(14)} ${omarOtp}
  Patient       layla.h (file 10482)           ${laylaPw}

  Patient invitation for file 10517 (valid 72 hours):
  ${config.APP_BASE_URL}/invite/patient/${token}

Staff 6-digit codes: add the secret to an authenticator app, or run
  npm run otp -- <secret>
`;
  console.log(summary);
  writeFileSync(join(config.dataDir, "dev-accounts.txt"), summary);
}
await close();
