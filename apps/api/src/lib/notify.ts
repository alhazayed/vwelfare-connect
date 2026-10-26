// SMS and email. Email goes through Resend once the super admin saves its API key and send-from address under
// APIs and services; until then, and for SMS (no provider chosen yet), messages are printed to the console.
// Rule: patient notifications never contain names, providers or message text.
import type { ProbeResult } from "./probe.ts";

export interface Notifier {
  sms(to: string, text: string): Promise<void>;
  email(to: string, subject: string, text: string): Promise<void>;
  /** Sends a test email (APIs and services → Test). Only notifiers that really send have it. */
  testEmail?(to: string): Promise<ProbeResult>;
}

/** Keeps the last two digits only. */
export const maskMobile = (to: string) => `…${to.replace(/\D/g, "").slice(-2)}`;
/** Keeps the first letter and the domain. */
export const maskEmail = (to: string) => to.replace(/^(.)[^@]*@/, "$1…@");
/** Invitation tokens travel after "#"; a printed link must never work. */
export const hideTokens = (text: string) => text.replace(/#[A-Za-z0-9_-]{8,}/g, "#[hidden]");

/**
 * Prints instead of sending. `reveal` is for local development only: anywhere else (Vercel, production) the log is
 * readable by everyone with access to the project, so it gets masked addresses and no working invitation links.
 */
export class ConsoleNotifier implements Notifier {
  sent: Array<{ channel: "sms" | "email"; to: string; text: string }> = [];
  constructor(private log: (msg: string) => void = console.log, private reveal = true) {}
  async sms(to: string, text: string) {
    this.sent.push({ channel: "sms", to, text });
    this.log(this.reveal ? `[sms → ${to}] ${text}` : `[sms → ${maskMobile(to)}] ${hideTokens(text)}`);
  }
  async email(to: string, subject: string, text: string) {
    this.sent.push({ channel: "email", to, text });
    this.log(this.reveal ? `[email → ${to}] ${subject}: ${text}` : `[email → ${maskEmail(to)}] ${subject}: ${hideTokens(text)}`);
  }
}

export type EmailSettings = { enabled: boolean; apiKey?: string; from?: string };

/**
 * Email through Resend's API; SMS still goes to `fallback`. When email is switched off or not set up, emails go to
 * `fallback` too. A failed send is logged (masked address, status code only) and never throws, so a reminder or alert
 * can't stop the worker or undo the action that triggered it; the admin can resend an invitation.
 */
export class ResendNotifier implements Notifier {
  constructor(
    private fallback: Notifier,
    private settings: () => Promise<EmailSettings>,
    private log: (msg: string) => void = console.log,
    private base = "https://api.resend.com"
  ) {}

  sms(to: string, text: string) { return this.fallback.sms(to, text); }

  async email(to: string, subject: string, text: string) {
    const s = await this.settings();
    if (!s.enabled || !s.apiKey || !s.from) return this.fallback.email(to, subject, text);
    const r = await this.send(s, to, subject, text);
    if (!r.ok) this.log(`[email → ${maskEmail(to)}] not sent: ${r.result}${r.status ? ` (${r.status})` : ""}`);
  }

  async testEmail(to: string): Promise<ProbeResult> {
    const s = await this.settings();
    if (!s.apiKey || !s.from) return { ok: false, result: "email_not_set" };
    return this.send(s, to, "Vwelfare Connect test email", "This is a test from APIs and services in Vwelfare Connect. Email is working.");
  }

  private async send(s: EmailSettings, to: string, subject: string, text: string): Promise<ProbeResult> {
    try {
      const res = await fetch(`${this.base}/emails`, {
        method: "POST",
        headers: { authorization: `Bearer ${s.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: s.from, to: [to], subject, text }),
        redirect: "error",
        signal: AbortSignal.timeout(10_000)
      });
      await res.body?.cancel();
      return res.ok ? { ok: true, result: "email_sent", status: res.status } : { ok: false, result: "email_failed", status: res.status };
    } catch (e) {
      return { ok: false, result: (e as Error).name === "TimeoutError" ? "timeout" : "unreachable" };
    }
  }
}
