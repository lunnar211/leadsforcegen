import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminSessionToken, isAdminConfigured, verifyAdminCredentials } from "@/lib/adminAuth";
import { clientIp, counterGet, counterIncr, counterReset } from "@/lib/rate-limit";
import { serviceClient } from "@/lib/quota";

// Lockout policy: 5 FAILED attempts per (IP + email) within 15 minutes
// locks further attempts until the window expires. Successful login
// clears the counter.
//
// WHY SUPABASE FIRST: the old counters lived in Upstash (not configured
// here) or per-instance memory — on serverless, each request can hit a
// different instance with an empty counter, so the lockout NEVER engaged
// in production (the 2026-10-24 sweep ran 6 wrong passwords and saw no
// 429). The admin_login_failures table is shared across every instance,
// so the lockout now engages for real. Memory counters remain as a
// fallback when the table is unavailable; the lockout response is a
// generic 429 that reveals nothing about which part failed.
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
  const admin = serviceClient();

  let locked = false;
  if (admin) {
    try {
      const { data } = await admin.from("admin_login_failures").select("locked_until").eq("key", failKey).limit(1);
      const row = data?.[0] as { locked_until?: string } | undefined;
      if (row?.locked_until && new Date(row.locked_until).getTime() > Date.now()) locked = true;
    } catch { /* table not migrated yet — fall back to memory counters */ }
  }
  if (locked || (await counterGet(failKey)) >= MAX_FAILURES) {
    return NextResponse.json(
      { ok: false, error: "Too many failed attempts. Locked for up to 15 minutes." },
      { status: 429 },
    );
  }
  if (!email || !body.password || !verifyAdminCredentials(email, body.password)) {
    if (admin) {
      try {
        const { data } = await admin.from("admin_login_failures").select("failures").eq("key", failKey).limit(1);
        const row = data?.[0] as { failures?: number } | undefined;
        const failures = (row?.failures || 0) + 1;
        const lockedUntil = failures >= MAX_FAILURES ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null;
        if (row) {
          await admin.from("admin_login_failures").update({ failures, locked_until: lockedUntil }).eq("key", failKey);
        } else {
          await admin.from("admin_login_failures").insert({ key: failKey, failures, locked_until: lockedUntil });
        }
      } catch { /* fall through to memory counter */ }
    }
    await counterIncr(failKey, LOCKOUT_MS);
    return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
  }
  if (admin) {
    try {
      await admin.from("admin_login_failures").delete().eq("key", failKey);
    } catch { /* ignore */ }
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
