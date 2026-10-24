import { NextResponse } from "next/server";
import { getAuthUser, serviceClient } from "@/lib/quota";
import { rateLimit } from "@/lib/rate-limit";

// Validates a coupon code for a signed-in user. Returns ONLY the percent
// — the payable amount is always recomputed server-side at checkout
// (see the manual-proof route); a client can never set its own price.
// Throttled (sweep finding S2): 20 rapid bogus guesses previously all
// returned 404 with no slowdown. The first version throttled per IP and
// still showed 20x404 in the confirmation round — same failure as the
// first admin lockout: the client IP varies between requests (proxied
// clients, rotating egress), so an IP-keyed counter never accumulates.
// This endpoint is authenticated, so the throttle is keyed by USER ID:
// 10 checks/minute per user; the 11th gets a 429. Guessing still can't
// succeed — it just can't run hot. Auth runs first so the counter key
// is always a real user, never "unknown".
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!(await rateLimit(`coupon-validate:${user.id}`, 10, 60_000))) {
    return NextResponse.json({ ok: false, error: "Too many code checks. Try again in a minute." }, { status: 429 });
  }
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Coupons are not available right now." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const code = String(body.code || "").trim().toUpperCase();
  if (!code) return NextResponse.json({ ok: false, error: "Enter a coupon code." }, { status: 400 });
  const { data, error } = await admin.from("coupons").select("percent_off, active, max_uses, used_count").eq("code", code).limit(1);
  const row = !error && data && data[0];
  if (!row || !row.active) return NextResponse.json({ ok: false, error: "That code is not valid." }, { status: 404 });
  if (row.max_uses && Number(row.used_count || 0) >= Number(row.max_uses)) {
    return NextResponse.json({ ok: false, error: "That code has reached its usage limit." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, data: { code, percent_off: Number(row.percent_off) } });
}
