import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminSessionToken, isAdminConfigured, verifyAdminCredentials } from "@/lib/adminAuth";

// Tiny in-memory rate limit: 5 attempts per minute per IP (per instance).
const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || rec.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  rec.count += 1;
  return rec.count > 5;
}

export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Admin login is not configured on the server yet." },
      { status: 503 },
    );
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!body.email || !body.password || !verifyAdminCredentials(body.email, body.password)) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, createAdminSessionToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 3600,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
