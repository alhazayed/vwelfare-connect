// A stand-in for the EMR vendor's API, following "Vwelfare Connect – EMR API Requirements" (R1–R5).
// In-memory only: everything resets when the process restarts.
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import formbody from "@fastify/formbody";
import { randomBytes, createHash } from "node:crypto";
import { patients, seedRecords, type StoredRecord } from "./data.ts";

export type MockEmrOptions = { clientId: string; clientSecret: string; logger?: boolean };

type SaveBody = {
  record: Omit<StoredRecord, "recordId" | "attachments"> & {
    attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string }>;
  };
  attachmentContents: Array<{ id: string; contentBase64: string }>;
};

export function buildMockEmr(opts: MockEmrOptions) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 60 * 1024 * 1024 });
  app.register(formbody);

  const tokens = new Set<string>();
  const records: StoredRecord[] = seedRecords();
  const byIdempotencyKey = new Map<string, StoredRecord>();
  const state = { outage: false };

  const summary = (r: StoredRecord) => ({
    recordId: r.recordId,
    recordName: r.recordName,
    providerStaffId: r.provider.staffId,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    messageCount: r.messages.filter(m => m.sender !== "system" && m.text !== undefined).length,
    attachmentCount: r.attachments.length
  });

  // Simulated outage: every API call except the test switch answers 503.
  app.addHook("onRequest", async (req, reply) => {
    if (state.outage && !req.url.startsWith("/__mock")) return reply.code(503).send({ code: "unavailable", message: "Simulated outage" });
  });

  const requireToken = async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!tokens.has(token)) return reply.code(401).send({ code: "unauthorized", message: "Missing or invalid access token" });
  };

  app.post("/oauth/token", async (req, reply) => {
    const body = req.body as Record<string, string> | undefined;
    if (body?.grant_type !== "client_credentials" || body.client_id !== opts.clientId || body.client_secret !== opts.clientSecret) {
      return reply.code(401).send({ error: "invalid_client" });
    }
    const token = randomBytes(24).toString("hex");
    tokens.add(token);
    return { access_token: token, token_type: "Bearer", expires_in: 3600, scope: "patient.name patient.visits chat-records.read chat-records.write" };
  });

  // R1 — name only.
  app.get<{ Params: { file: string } }>("/patients/:file", { preHandler: requireToken }, async (req, reply) => {
    const p = patients[req.params.file];
    if (!p) return reply.code(404).send({ code: "not_found", message: "No patient with that file number" });
    return { fileNumber: req.params.file, name: p.name };
  });

  // R2 — visit dates only.
  app.get<{ Params: { file: string } }>("/patients/:file/visits", { preHandler: requireToken }, async (req, reply) => {
    const p = patients[req.params.file];
    if (!p) return reply.code(404).send({ code: "not_found", message: "No patient with that file number" });
    return { fileNumber: req.params.file, visits: p.visits.map(date => ({ date })) };
  });

  // R3 — summaries, no content.
  app.get<{ Params: { file: string }; Querystring: { provider?: string } }>("/patients/:file/chat-records", { preHandler: requireToken }, async (req, reply) => {
    if (!patients[req.params.file]) return reply.code(404).send({ code: "not_found", message: "No patient with that file number" });
    const list = records
      .filter(r => r.fileNumber === req.params.file && (!req.query.provider || r.provider.staffId === req.query.provider))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map(summary);
    return { fileNumber: req.params.file, records: list };
  });

  // R4 — one record, attachments listed without content.
  app.get<{ Params: { id: string } }>("/chat-records/:id", { preHandler: requireToken }, async (req, reply) => {
    const r = records.find(x => x.recordId === req.params.id);
    if (!r) return reply.code(404).send({ code: "not_found", message: "No such chat record" });
    const { attachments, ...rest } = r;
    return { ...rest, attachments: attachments.map(({ content, ...meta }) => meta) };
  });

  app.get<{ Params: { id: string; att: string } }>("/chat-records/:id/attachments/:att", { preHandler: requireToken }, async (req, reply) => {
    const a = records.find(x => x.recordId === req.params.id)?.attachments.find(x => x.id === req.params.att);
    if (!a) return reply.code(404).send({ code: "not_found", message: "No such attachment" });
    return reply.header("content-type", a.mimeType).send(a.content);
  });

  // R5 — save, all or nothing, idempotent.
  app.post<{ Params: { file: string }; Body: SaveBody }>("/patients/:file/chat-records", { preHandler: requireToken }, async (req, reply) => {
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || !key) return reply.code(400).send({ code: "missing_idempotency_key", message: "Idempotency-Key header is required" });
    const existing = byIdempotencyKey.get(key);
    if (existing) return reply.code(200).send({ recordId: existing.recordId, recordName: existing.recordName });
    if (!patients[req.params.file]) return reply.code(404).send({ code: "not_found", message: "No patient with that file number" });

    const { record, attachmentContents } = req.body ?? ({} as SaveBody);
    if (!record?.recordName || !Array.isArray(record.messages) || record.fileNumber !== req.params.file) {
      return reply.code(400).send({ code: "invalid_record", message: "Record is missing fields or has the wrong file number" });
    }
    const atts = [];
    for (const meta of record.attachments ?? []) {
      const raw = attachmentContents?.find(c => c.id === meta.id);
      if (!raw) return reply.code(400).send({ code: "invalid_record", message: `Attachment ${meta.id} has no content` });
      const content = Buffer.from(raw.contentBase64, "base64");
      if (createHash("sha256").update(content).digest("hex") !== meta.sha256) {
        return reply.code(400).send({ code: "checksum_mismatch", message: `Attachment ${meta.id} checksum does not match` });
      }
      atts.push({ ...meta, content });
    }
    const stored: StoredRecord = { ...record, recordId: `EMR-DOC-${String(882000 + records.length).padStart(6, "0")}`, attachments: atts };
    records.push(stored);
    byIdempotencyKey.set(key, stored);
    return reply.code(201).send({ recordId: stored.recordId, recordName: stored.recordName });
  });

  // Test-only switch, not part of the vendor contract.
  app.post<{ Body: { on: boolean } }>("/__mock/outage", async req => {
    state.outage = !!req.body?.on;
    return { outage: state.outage };
  });

  return { app, records, state };
}
