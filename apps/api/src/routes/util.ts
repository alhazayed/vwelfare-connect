import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpError, type Deps } from "../deps.ts";
import { ALLOWED_TYPES, allowedMime } from "../lib/files.ts";
import type { EmrRecord } from "../emr/client.ts";

export async function readUpload(deps: Deps, req: FastifyRequest) {
  const data = await req.file();
  if (!data) throw new HttpError(400, "no_file", "Attach a file");
  const content = await data.toBuffer();
  const name = data.filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 150);
  const mimeType = allowedMime(name);
  if (!mimeType) throw new HttpError(415, "file_type", "This file can't be shared. Use PDF, JPG, PNG, DOCX or M4A, up to 10 MB.");
  if (!(await deps.scanner.scan(content, name)).clean) throw new HttpError(422, "file_rejected", "This file was blocked by the virus scan.");
  return { name, mimeType, content };
}

const SHAREABLE = new Set(Object.values(ALLOWED_TYPES));

/**
 * Streams a file for read-only viewing: inline, never cached. Only the shareable types are sent: any other type (for example
 * one the EMR reports differently) is refused, so a browser never renders it as a page.
 * The CSP allows the browser's own PDF, image and audio viewers but no scripts or framing.
 */
export function sendProtectedFile(reply: FastifyReply, mimeType: string, content: Buffer) {
  const type = mimeType.split(";")[0]!.trim().toLowerCase();
  if (!SHAREABLE.has(type)) throw new HttpError(415, "file_type", "This file can't be shown.");
  return reply
    .header("content-type", type)
    .header("content-security-policy", "frame-ancestors 'none'; script-src 'none'")
    .header("content-disposition", "inline")
    .header("cache-control", "no-store")
    .header("x-content-type-options", "nosniff")
    .send(content);
}

/** The shape the web app shows for a past chat. */
export function recordView(r: EmrRecord, providerName: { en: string; ar?: string | null } | null) {
  return {
    recordId: r.recordId,
    recordName: r.recordName,
    fileNumber: r.fileNumber,
    provider: { staffId: r.provider.staffId, name: providerName ?? { en: r.provider.name } },
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    risk: !!r.risk,
    messages: r.messages,
    attachments: r.attachments
  };
}
