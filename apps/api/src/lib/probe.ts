// "Test connection" for services whose integration isn't built yet (SMS, virus scanning, services the admin adds).
// It only checks that something answers at the saved address: no key or password is sent, and nothing the server
// answers is kept or shown, apart from the HTTP status. (Email is tested by sending a real test email: lib/notify.ts.)
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ProbeResult = {
  ok: boolean;
  /** reachable | server_error | not_set | bad_address | blocked_address | unreachable | timeout | email_sent | email_failed | email_not_set */
  result: string;
  status?: number;
};

const TIMEOUT_MS = 8000;

/** Addresses a test must never reach: cloud metadata and link-local always; loopback and private networks on the live system. */
export function blockedIp(ip: string, production: boolean): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number) as [number, number];
    if (a === 0 || (a === 169 && b === 254)) return true;
    if (!production) return false;
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || /^fe[89ab]/.test(v6)) return true;
  if (!production) return false;
  return v6 === "::1" || /^f[cd]/.test(v6);
}

/** Why the host can't be tested, or null when it can. */
async function hostProblem(hostname: string, production: boolean): Promise<ProbeResult | null> {
  const host = hostname.replace(/^\[|\]$/g, "");
  let ips: string[];
  try { ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map(a => a.address); } catch { return { ok: false, result: "unreachable" }; }
  return ips.some(ip => blockedIp(ip, production)) ? { ok: false, result: "blocked_address" } : null;
}

/** Sends a HEAD request to the address. Any HTTP answer below 500 means the service is there. */
export async function probeHttp(address: string | undefined, production: boolean): Promise<ProbeResult> {
  if (!address) return { ok: false, result: "not_set" };
  let u: URL;
  try { u = new URL(address); } catch { return { ok: false, result: "bad_address" }; }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return { ok: false, result: "bad_address" };
  const problem = await hostProblem(u.hostname, production);
  if (problem) return problem;
  try {
    const res = await fetch(u, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.body?.cancel();
    return res.status >= 500 ? { ok: false, result: "server_error", status: res.status } : { ok: true, result: "reachable", status: res.status };
  } catch (e) {
    return { ok: false, result: (e as Error).name === "TimeoutError" ? "timeout" : "unreachable" };
  }
}
