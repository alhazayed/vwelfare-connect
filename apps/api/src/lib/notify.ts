// SMS and email. Development implementations print to the console.
// Production: plug in an SMS/email provider licensed in Vwelfare's country.
// Rule: patient notifications never contain names, providers or message text.

export interface Notifier {
  sms(to: string, text: string): Promise<void>;
  email(to: string, subject: string, text: string): Promise<void>;
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
