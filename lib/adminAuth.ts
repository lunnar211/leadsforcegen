import { createHmac, timingSafeEqual } from "crypto";

// Server-only admin gate for /admin.
// The admin email comes from ADMIN_EMAIL, the password from ADMIN_PASSWORD,
// and the cookie signing secret from ADMIN_SESSION_SECRET (falling back to
// ADMIN_PASSWORD). None of these values ever live in code or in the repo —
// they are set in the hosting environment (Vercel dashboard).

export const ADMIN_COOKIE = "lfg_admin";
const SESSION_HOURS = 12;

function adminEmail(): string {
  return (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
}

function signingSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

export function isAdminConfigured(): boolean {
  return Boolean(adminEmail() && process.env.ADMIN_PASSWORD && signingSecret());
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyAdminCredentials(email: string, password: string): boolean {
  if (!isAdminConfigured()) return false;
  const emailOk = safeEqual(email.trim().toLowerCase(), adminEmail());
  const passOk = safeEqual(password, process.env.ADMIN_PASSWORD as string);
  return emailOk && passOk;
}

export function createAdminSessionToken(): string {
  const payload = `${adminEmail()}.${Date.now() + SESSION_HOURS * 3600_000}`;
  const sig = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyAdminSessionToken(token: string | undefined): boolean {
  if (!token || !isAdminConfigured()) return false;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return false;
  const payload = Buffer.from(payloadB64, "base64url").toString();
  const expected = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  if (!safeEqual(sig, expected)) return false;
  const cut = payload.lastIndexOf(".");
  if (cut < 1) return false;
  const email = payload.slice(0, cut);
  const expires = payload.slice(cut + 1);
  if (email.trim().toLowerCase() !== adminEmail()) return false;
  return Number(expires) > Date.now();
}
