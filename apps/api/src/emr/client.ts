// The only code that talks to the EMR. It calls R1–R5 and nothing else.
// Replacing the EMR means replacing this file.

export type Bilingual = { en: string; ar?: string };

export type EmrRecordSummary = {
  recordId: string;
  recordName: string;
  providerStaffId: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  attachmentCount: number;
};

export type EmrMessage = { seq: number; sentAt: string; sender: "patient" | "provider" | "system"; text?: string; attachmentId?: string };
export type EmrAttachmentMeta = { id: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string };

export type EmrRecord = {
  recordId?: string;
  recordName: string;
  fileNumber: string;
  provider: { staffId: string; name: string };
  startedAt: string;
  endedAt: string;
  finishedBy: "provider" | "auto" | "deactivation";
  messages: EmrMessage[];
  attachments: EmrAttachmentMeta[];
};

export class EmrUnavailable extends Error {}

export class EmrClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private baseUrl: string, private clientId: string, private clientSecret: string) {}

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const res = await this.fetch("/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: this.clientId, client_secret: this.clientSecret }).toString()
    }, false);
    if (!res.ok) throw new EmrUnavailable(`EMR token request failed: ${res.status}`);
    const body = await res.json() as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  private async fetch(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
    const headers = new Headers(init.headers);
    if (auth) headers.set("authorization", `Bearer ${await this.getToken()}`);
    let res: Response;
    try {
      res = await fetch(new URL(path, this.baseUrl), { ...init, headers, signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new EmrUnavailable(`EMR not reachable: ${(e as Error).message}`);
    }
    if (res.status === 401 && auth) { this.token = null; }
    if (res.status >= 500) throw new EmrUnavailable(`EMR responded ${res.status}`);
    return res;
  }

  private async json<T>(path: string): Promise<T | null> {
    const res = await this.fetch(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new EmrUnavailable(`EMR responded ${res.status} for ${path}`);
    return res.json() as Promise<T>;
  }

  /** R1 */
  async getPatientName(fileNumber: string): Promise<Bilingual | null> {
    const body = await this.json<{ name: Bilingual }>(`/patients/${encodeURIComponent(fileNumber)}?fields=name`);
    return body?.name ?? null;
  }

  /** R2 */
  async getVisits(fileNumber: string): Promise<string[]> {
    const body = await this.json<{ visits: Array<{ date: string }> }>(`/patients/${encodeURIComponent(fileNumber)}/visits?fields=date`);
    return body?.visits.map(v => v.date) ?? [];
  }

  /** R3 */
  async listChatRecords(fileNumber: string, staffId?: string): Promise<EmrRecordSummary[]> {
    const q = staffId ? `?provider=${encodeURIComponent(staffId)}` : "";
    const body = await this.json<{ records: EmrRecordSummary[] }>(`/patients/${encodeURIComponent(fileNumber)}/chat-records${q}`);
    return body?.records ?? [];
  }

  /** R4 */
  async getChatRecord(recordId: string): Promise<EmrRecord | null> {
    return this.json<EmrRecord>(`/chat-records/${encodeURIComponent(recordId)}`);
  }

  async getAttachment(recordId: string, attachmentId: string): Promise<{ mimeType: string; content: Buffer } | null> {
    const res = await this.fetch(`/chat-records/${encodeURIComponent(recordId)}/attachments/${encodeURIComponent(attachmentId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new EmrUnavailable(`EMR responded ${res.status}`);
    return { mimeType: res.headers.get("content-type") ?? "application/octet-stream", content: Buffer.from(await res.arrayBuffer()) };
  }

  /** R5 — safe to retry: the idempotency key is the platform's chat ID. */
  async saveChatRecord(record: EmrRecord, contents: Array<{ id: string; content: Buffer }>, idempotencyKey: string): Promise<{ recordId: string }> {
    const res = await this.fetch(`/patients/${encodeURIComponent(record.fileNumber)}/chat-records`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify({ record, attachmentContents: contents.map(c => ({ id: c.id, contentBase64: c.content.toString("base64") })) })
    });
    if (res.status === 200 || res.status === 201) return res.json() as Promise<{ recordId: string }>;
    const detail = await res.text().catch(() => "");
    throw new Error(`EMR rejected the chat record (${res.status}): ${detail.slice(0, 300)}`);
  }
}
