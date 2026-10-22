import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminSessionToken, isAdminConfigured, verifyAdminCredentials } from "@/lib/adminAuth";
import { clientIp, counterGet, counterIncr, counterReset } from "@/lib/rate-limit";

// Lockout policy: 5 FAILED attempts per (IP + email) within 15 minutes
// locks further attempts until the window expires. Successful login
// clears the counter. Counters live in Upstash when configured,
// in-memory otherwise.
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60_000;

export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Admin login is not configured on the server yet." },
      { status: 503 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = (body.email || "").trim().toLowerCase();
  const failKey = `admin-fail:${clientIp(req)}:${email}`;

  if ((await counterGet(failKey)) >= MAX_FAILURES) {
    return NextResponse.json(
      { ok: false, error: "Too many failed attempts. Locked for up to 15 minutes." },
      { status: 429 },
    );
  }
  if (!email || !body.password || !verifyAdminCredentials(email, body.password)) {
    await counterIncr(failKey, LOCKOUT_MS);
    return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
  }
  await counterReset(failKey);
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
