// Sample accounts for Vercel preview deployments, so the app can be tried without a local machine.
// Runs only when VERCEL_ENV is "preview" and PREVIEW_SEED_PASSWORD is set (Preview scope only, in the Vercel
// project settings). Every account gets that password; nothing about the accounts is logged. Staff aren't
// enrolled in MFA, so the first staff sign-in shows the authenticator QR code.
import { eq } from "drizzle-orm";
import { patients, providerPatients, staff } from "../db/schema.ts";
import { hashPassword } from "../lib/crypto.ts";
import type { Deps } from "../deps.ts";

export const PREVIEW_ACCOUNTS = {
  providers: ["s.almansour@vwelfare.example", "o.khalil@vwelfare.example"],
  patient: { username: "layla.h", fileNumber: "10482" }
} as const;

// Named results (not bare strings), so the error-code check in test/i18n.test.ts doesn't read them as error codes.
const RESULT = { off: "off", exists: "exists", added: "added" } as const;
export type PreviewSeedResult = typeof RESULT[keyof typeof RESULT];

export async function seedPreview(deps: Deps): Promise<PreviewSeedResult> {
  const { db, config, cipher } = deps;
  const password = config.PREVIEW_SEED_PASSWORD;
  if (config.production || config.VERCEL_ENV !== "preview" || !password) return RESULT.off;
  if (await db.query.staff.findFirst({ where: eq(staff.email, config.SEED_ADMIN_EMAIL) })) return RESULT.exists;

  const passwordHash = await hashPassword(password);
  try {
    await db.transaction(async tx => {
      await tx.insert(staff).values({ role: "admin", email: config.SEED_ADMIN_EMAIL, nameEn: "Vwelfare Admin", nameAr: "مشرف Vwelfare", passwordHash });
      const [sara] = await tx.insert(staff).values({
        role: "provider", email: PREVIEW_ACCOUNTS.providers[0], nameEn: "Dr. Sara Al-Mansour", nameAr: "د. سارة المنصور",
        specialtyEn: "Psychiatrist", specialtyAr: "طبيبة نفسية", emrStaffId: "ST-0193", passwordHash
      }).returning();
      const [omar] = await tx.insert(staff).values({
        role: "provider", email: PREVIEW_ACCOUNTS.providers[1], nameEn: "Omar Khalil", nameAr: "عمر خليل",
        specialtyEn: "Clinical psychologist", specialtyAr: "أخصائي نفسي إكلينيكي", emrStaffId: "ST-0207", passwordHash
      }).returning();
      const { username, fileNumber } = PREVIEW_ACCOUNTS.patient;
      await tx.insert(patients).values({ fileNumber, username, passwordHash, status: "active", invitedBy: sara!.id, mobileEnc: cipher.encrypt("+000000004417"), termsAcceptedAt: deps.now() });
      await tx.insert(providerPatients).values([{ providerId: sara!.id, fileNumber }, { providerId: omar!.id, fileNumber }]);
    });
  } catch (e) {
    // Two instances starting at once: the other one added them first.
    if (await db.query.staff.findFirst({ where: eq(staff.email, config.SEED_ADMIN_EMAIL) })) return RESULT.exists;
    throw e;
  }
  return RESULT.added;
}
