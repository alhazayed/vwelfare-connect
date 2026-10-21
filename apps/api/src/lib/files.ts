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
