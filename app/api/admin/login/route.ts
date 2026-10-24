import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminSessionToken, isAdminConfigured, verifyAdminCredentials } from "@/lib/adminAuth";
import { counterGet, counterIncr, counterReset } from "@/lib/rate-limit";
import { serviceClient } from "@/lib/quota";

// Lockout policy: 5 FAILED attempts per EMAIL within 15 minutes locks
// further attempts until the window expires. Successful login clears
// the counter.
//
// WHY EMAIL-ONLY, NOT IP+EMAIL: the first version keyed by IP+email and
// still never engaged — the confirmation round ran 10 wrong passwords
// and saw 10x401. Two IP-keyed mechanisms failed the same way while
// every user-keyed mechanism (quota races) held exactly, which points
// at the client IP varying between requests (proxied clients, rotating
// egress) rather than at the shared table. An attacker rotates IPs for
// free, so an IP-keyed lockout is no lockout at all. The email key
// cannot be rotated around. Trade-off, stated plainly: anyone who
// knows the (non-public) admin email can lock the owner out for up to
// 15 minutes by spamming wrong passwords — bounded, and far better
// than a lockout that never fires.
//
// WHY SUPABASE FIRST: the old counters lived in Upstash (not configured
// here) or per-instance memory — on serverless, each request can hit a
// different instance with an empty counter. The admin_login_failures
// table is shared across every instance. Memory counters remain as a
// fallback when the table is unavailable; the lockout response is a
// generic 429 that reveals nothing about which part failed. Supabase
// errors are logged server-side (Vercel logs only, never to the
// client) so a silent degradation is visible next time.
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
  const failKey = `admin-fail:${email}`;
  const admin = serviceClient();

  let locked = false;
  if (admin) {
    try {
      const { data, error } = await admin.from("admin_login_failures").select("locked_until").eq("key", failKey).limit(1);
      if (error) console.error("admin lockout read failed:", error.message);
      const row = data?.[0] as { locked_until?: string } | undefined;
      if (row?.locked_until && new Date(row.locked_until).getTime() > Date.now()) locked = true;
    } catch (e) { console.error("admin lockout read threw:", e instanceof Error ? e.message : "unknown"); }
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
        const { data, error } = await admin.from("admin_login_failures").select("failures").eq("key", failKey).limit(1);
        if (error) console.error("admin lockout read failed:", error.message);
        const row = data?.[0] as { failures?: number } | undefined;
        const failures = (row?.failures || 0) + 1;
        const lockedUntil = failures >= MAX_FAILURES ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null;
        const write = row
          ? await admin.from("admin_login_failures").update({ failures, locked_until: lockedUntil }).eq("key", failKey)
          : await admin.from("admin_login_failures").insert({ key: failKey, failures, locked_until: lockedUntil });
        if (write.error) console.error("admin lockout write failed:", write.error.message);
      } catch (e) { console.error("admin lockout write threw:", e instanceof Error ? e.message : "unknown"); }
    }
    await counterIncr(failKey, LOCKOUT_MS);
    return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
  }
  if (admin) {
    try {
      const { error } = await admin.from("admin_login_failures").delete().eq("key", failKey);
      if (error) console.error("admin lockout clear failed:", error.message);
    } catch (e) { console.error("admin lockout clear threw:", e instanceof Error ? e.message : "unknown"); }
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
