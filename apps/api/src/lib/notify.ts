// SMS and email. Development implementations print to the console.
// Production: plug in an SMS/email provider licensed in Vwelfare's country.
// Rule: patient notifications never contain names, providers or message text.

export interface Notifier {
  sms(to: string, text: string): Promise<void>;
  email(to: string, subject: string, text: string): Promise<void>;
}

export class ConsoleNotifier implements Notifier {
  sent: Array<{ channel: "sms" | "email"; to: string; text: string }> = [];
  constructor(private log: (msg: string) => void = console.log) {}
  async sms(to: string, text: string) {
    this.sent.push({ channel: "sms", to, text });
    this.log(`[sms → ${to}] ${text}`);
  }
  async email(to: string, subject: string, text: string) {
    this.sent.push({ channel: "email", to, text });
    this.log(`[email → ${to}] ${subject}: ${text}`);
  }
}
