// "Test connection" for services whose integration isn't built yet (SMS, email, virus scanning, services the admin adds).
// It only checks that something answers at the saved address: no key or password is sent, and nothing the server
// answers is kept or shown, apart from the HTTP status or the SMTP greeting code.
import { lookup } from "node:dns/promises";
import { isIP, connect as tcpConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";

export type ProbeResult = {
  ok: boolean;
  /** reachable | server_error | not_set | bad_address | blocked_address | unreachable | timeout | not_smtp */
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

/** Opens a connection to the mail server and waits for its "220" greeting, then says goodbye. Nothing is signed in to. */
export async function probeSmtp(host: string | undefined, portText: string | undefined, production: boolean): Promise<ProbeResult> {
  if (!host) return { ok: false, result: "not_set" };
  const port = Number(portText || 587);
  if (!/^[A-Za-z0-9.\-:[\]]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, result: "bad_address" };
  const problem = await hostProblem(host, production);
  if (problem) return problem;
  return new Promise<ProbeResult>(resolve => {
    let done = false;
    let greeting = "";
    const finish = (r: ProbeResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.end("QUIT\r\n"); } catch { /* already closed */ }
      socket.destroy();
      resolve(r);
    };
    const opts = { host: host.replace(/^\[|\]$/g, ""), port, servername: isIP(host) ? undefined : host };
    // Port 465 speaks TLS from the start; the others greet in plain text first.
    const socket: Socket = port === 465 ? tlsConnect(opts) : tcpConnect(opts);
    const timer = setTimeout(() => finish({ ok: false, result: "timeout" }), TIMEOUT_MS);
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      greeting += chunk;
      if (!greeting.includes("\n") && greeting.length < 512) return;
      const status = Number(greeting.slice(0, 3));
      finish(status === 220 ? { ok: true, result: "reachable", status } : { ok: false, result: "not_smtp" });
    });
    socket.on("error", () => finish({ ok: false, result: "unreachable" }));
    socket.on("close", () => finish({ ok: false, result: "unreachable" }));
  });
}
