import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, SCRYPT);
  return timingSafeEqual(key, expected);
}

export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext). */
export class FieldCipher {
  private key: Buffer;
  constructor(keyBase64: string) {
    this.key = Buffer.from(keyBase64, "base64");
    if (this.key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  }
  encryptBuffer(plain: Buffer): Buffer {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([c.update(plain), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]);
  }
  decryptBuffer(blob: Buffer): Buffer {
    const d = createDecipheriv("aes-256-gcm", this.key, blob.subarray(0, 12));
    d.setAuthTag(blob.subarray(12, 28));
    return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
  }
  encrypt(plain: string): string {
    return this.encryptBuffer(Buffer.from(plain, "utf8")).toString("base64");
  }
  decrypt(enc: string): string {
    return this.decryptBuffer(Buffer.from(enc, "base64")).toString("utf8");
  }
}
