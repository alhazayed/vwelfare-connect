// Files shared in open chats: encrypted on disk, deleted once the EMR saves the chat.
// Production: swap for private, encrypted cloud object storage behind the same interface.
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { FieldCipher } from "./crypto.ts";

export interface FileStore {
  put(content: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export class EncryptedDiskStore implements FileStore {
  constructor(private dir: string, private cipher: FieldCipher) {}
  async put(content: Buffer) {
    await mkdir(this.dir, { recursive: true });
    const key = randomUUID();
    await writeFile(join(this.dir, key), this.cipher.encryptBuffer(content));
    return key;
  }
  async get(key: string) {
    return this.cipher.decryptBuffer(await readFile(join(this.dir, key)));
  }
  async delete(key: string) {
    await rm(join(this.dir, key), { force: true });
  }
}

export class MemoryStore implements FileStore {
  files = new Map<string, Buffer>();
  async put(content: Buffer) { const k = randomUUID(); this.files.set(k, content); return k; }
  async get(key: string) { const f = this.files.get(key); if (!f) throw new Error("not found"); return f; }
  async delete(key: string) { this.files.delete(key); }
}

/** Malware scanning. Required before launch: connect ClamAV or the cloud provider's scanner here. */
export interface Scanner { scan(content: Buffer, fileName: string): Promise<{ clean: boolean }> }
export const noScan: Scanner = { async scan() { return { clean: true }; } };

export const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  m4a: "audio/mp4"
};
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function allowedMime(fileName: string): string | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return ALLOWED_TYPES[ext] ?? null;
}

/**
 * Does the file start the way its type says? A file named .png that is really a web page (or anything else) is refused,
 * so the EMR never receives a mislabelled file.
 */
export function matchesType(mimeType: string, content: Buffer): boolean {
  const starts = (...bytes: number[]) => bytes.every((b, i) => content[i] === b);
  switch (mimeType) {
    case "application/pdf": return content.subarray(0, 1024).includes("%PDF-");
    case "image/jpeg": return starts(0xff, 0xd8, 0xff);
    case "image/png": return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    // A Word file is a zip that holds word/document.xml (zip entry names are stored as plain text).
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": return starts(0x50, 0x4b, 0x03, 0x04) && content.includes("word/");
    case "audio/mp4": return content.subarray(4, 8).toString("latin1") === "ftyp";
    default: return false;
  }
}

/**
 * Photos are redrawn without their metadata: location, camera, time and any embedded text never reach the EMR.
 * The picture is turned upright first, since the orientation tag goes with the rest. Other types are unchanged.
 */
export async function stripImageMetadata(mimeType: string, content: Buffer): Promise<Buffer> {
  if (mimeType !== "image/jpeg" && mimeType !== "image/png") return content;
  const { default: sharp } = await import("sharp");
  const img = sharp(content, { failOn: "error", limitInputPixels: 50_000_000 }).rotate();
  return mimeType === "image/jpeg" ? img.jpeg({ quality: 90, mozjpeg: true }).toBuffer() : img.png().toBuffer();
}
