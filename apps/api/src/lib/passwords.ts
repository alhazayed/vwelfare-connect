// New passwords: at least 12 characters, and not one that has appeared in a known data breach.
// The breach check uses Have I Been Pwned's range API (k-anonymity): only the first 5 characters of the password's
// SHA-1 hash leave the server, and the reply is padded so its size gives nothing away either.
import { createHash } from "node:crypto";
import { HttpError } from "../deps.ts";

export const MIN_PASSWORD = 12;

/** true = seen in a breach, false = not seen, null = couldn't check (the service didn't answer in time). */
export type BreachCheck = (password: string) => Promise<boolean | null>;

export function hibpCheck(base = "https://api.pwnedpasswords.com", timeoutMs = 3000): BreachCheck {
  return async password => {
    const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
    const prefix = hash.slice(0, 5), suffix = hash.slice(5);
    try {
      const res = await fetch(`${base}/range/${prefix}`, {
        headers: { "Add-Padding": "true", "user-agent": "vwelfare-connect" },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) return null;
      for (const line of (await res.text()).split("\n")) {
        const [s, count] = line.trim().split(":");
        // Padding rows have a count of 0.
        if (s === suffix) return Number(count) > 0;
      }
      return false;
    } catch {
      return null;
    }
  };
}

/**
 * Refuses a breached password. If the check service can't be reached the password is accepted (the 12-character
 * minimum still applies), so an outage never stops a patient or provider from finishing their account set-up.
 */
export async function refuseBreached(check: BreachCheck, password: string, log: { warn: (msg: string) => void }) {
  const seen = await check(password);
  if (seen === null) log.warn("leaked-password check unavailable; password accepted on length alone");
  if (seen) throw new HttpError(400, "password_breached", "This password has appeared in a data breach. Choose a different one.");
}
