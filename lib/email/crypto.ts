import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for the user's own provider credentials (Brevo/Resend API
// key or SMTP password). The key lives ONLY in the Vercel env var
// EMAIL_CREDENTIALS_SECRET (hex, 32 bytes) — never in code, never in
// the database, never in a client response. Without it, saving provider
// settings fails loudly instead of storing anything plaintext.
function secretKey(): Buffer {
  const hex = process.env.EMAIL_CREDENTIALS_SECRET || "";
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error("EMAIL_CREDENTIALS_SECRET is not configured (need 64 hex chars).");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plain: string): string {
  const key = secretKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(blob: string): string {
  const key = secretKey();
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function hashToken(): string {
  return randomBytes(24).toString("hex");
}
