// Staff authenticator codes (TOTP, 30-second steps, 6 digits), on otplib 13.
import { createGuardrails, generateSecret, generateSync, generateURI, verifySync } from "otplib";

// Secrets created before otplib 13 are 10 bytes (16 Base32 characters). otplib 13 refuses anything under 16 bytes
// by default, which would lock every existing staff member out, so 10 is allowed. New secrets are 20 bytes.
const guardrails = createGuardrails({ MIN_SECRET_BYTES: 10 });

export const newMfaSecret = () => generateSecret();

export const mfaUri = (email: string, secret: string) => generateURI({ issuer: "Vwelfare Connect", label: email, secret });

/** The code an authenticator app shows right now (tests and the development `npm run otp`). */
export const currentCode = (secret: string) => generateSync({ secret, guardrails });

/**
 * The time step a code belongs to, or null when it doesn't match. Only the current step is accepted, as before the
 * upgrade. Uses the real clock, as authenticator apps do.
 */
export function codeStep(code: string, secret: string): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const r = verifySync({ secret, token: code, guardrails });
  return r.valid && "timeStep" in r ? r.timeStep : null;
}
