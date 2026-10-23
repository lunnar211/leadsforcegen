import { NextResponse } from "next/server";
import { requireAdminSession, serviceClient } from "@/lib/adminDb";

// Owner-only coupon management. Coupons live in their own table (RLS on,
// no client policies); until the owner runs the latest schema.sql the
// routes answer activated:false instead of erroring.
export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const { data, error } = await admin.from("coupons").select("id, code, percent_off, active, max_uses, used_count, created_at").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ ok: true, data: { coupons: [], activated: false } });
  return NextResponse.json({ ok: true, data: { coupons: data || [], activated: true } });
}

export async function POST(req: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string; code?: string; percent_off?: number; max_uses?: number | null; active?: boolean };
  if (body.action === "create") {
    const code = String(body.code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const pct = Math.round(Number(body.percent_off || 0));
    if (code.length < 3 || code.length > 32) return NextResponse.json({ ok: false, error: "Code must be 3–32 characters (letters, numbers, - or _)." }, { status: 400 });
    if (!(pct >= 1 && pct <= 90)) return NextResponse.json({ ok: false, error: "Discount must be between 1% and 90%." }, { status: 400 });
    const maxUses = body.max_uses && Number(body.max_uses) > 0 ? Math.round(Number(body.max_uses)) : null;
    const { error } = await admin.from("coupons").insert({ code, percent_off: pct, max_uses: maxUses });
    if (error) return NextResponse.json({ ok: false, error: error.message.includes("coupons") ? "Coupons are not activated yet — run the latest supabase/schema.sql in the Supabase SQL editor." : "Could not create the coupon (is the code already used?)." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "toggle" && body.id) {
    const { error } = await admin.from("coupons").update({ active: !!body.active }).eq("id", body.id);
    if (error) return NextResponse.json({ ok: false, error: "Could not update the coupon." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "delete" && body.id) {
    const { error } = await admin.from("coupons").delete().eq("id", body.id);
    if (error) return NextResponse.json({ ok: false, error: "Could not delete the coupon." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
