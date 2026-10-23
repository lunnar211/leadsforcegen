import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_COOKIE, verifyAdminSessionToken } from "@/lib/adminAuth";

// Admin-only review queue for manual payments. Guarded by the same signed
// admin session cookie as /admin. Approve = money seen in the owner's
// eSewa/Khalti/bank account; it activates Pro for the buyer's profile and
// records a subscription period. Reject just closes the request.
async function requireAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminSessionToken(store.get(ADMIN_COOKIE)?.value);
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  return createClient(url, service, { auth: { persistSession: false } });
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  }
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const { data, error } = await admin
    .from("payments")
    .select("id, email, user_id, amount, currency, method, months, status, proof_path, created_at")
    .eq("gateway", "manual")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return NextResponse.json({ ok: false, error: "Could not load the queue." }, { status: 502 });
  const rows = await Promise.all(
    (data || []).map(async (row) => {
      let proofUrl: string | null = null;
      if (row.proof_path) {
        const { data: signed } = await admin.storage.from("payment-proofs").createSignedUrl(row.proof_path, 600);
        proofUrl = signed?.signedUrl || null;
      }
      return { ...row, proofUrl };
    }),
  );
  return NextResponse.json({ ok: true, data: rows });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  }
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; action?: string };
  if (!body.id || (body.action !== "approve" && body.action !== "reject" && body.action !== "refund")) {
    return NextResponse.json({ ok: false, error: "Provide id and action (approve|reject|refund)." }, { status: 400 });
  }
  const { data: payment, error: readErr } = await admin
    .from("payments")
    .select("id, user_id, email, months, status, amount, currency, method")
    .eq("id", body.id)
    .eq("gateway", "manual")
    .single();
  if (readErr || !payment) return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });

  if (body.action === "refund") {
    // Bookkeeping for money the owner returns out-of-band (eSewa/bank —
    // manual payments have no gateway API to refund through). This only
    // records the refund; the owner sends the money back himself.
    if (payment.status !== "captured") {
      return NextResponse.json({ ok: false, error: `Only a captured payment can be marked refunded (this one is ${payment.status}).` }, { status: 409 });
    }
    await admin.from("payments").update({ status: "refunded" }).eq("id", body.id);
    await admin.from("activity_log").insert({
      user_id: payment.user_id,
      message: `Admin marked manual payment refunded — ${payment.currency} ${Number(payment.amount).toLocaleString()} to ${payment.email || payment.user_id || "unknown buyer"} (money returned by owner via ${payment.method || "manual method"})`,
    });
    return NextResponse.json({ ok: true, data: { status: "refunded" } });
  }

  if (payment.status !== "pending") {
    return NextResponse.json({ ok: false, error: `Already ${payment.status}.` }, { status: 409 });
  }

  if (body.action === "reject") {
    await admin.from("payments").update({ status: "rejected" }).eq("id", body.id);
    return NextResponse.json({ ok: true, data: { status: "rejected" } });
  }

  // Approve: mark captured and activate Pro for the subscription period.
  await admin.from("payments").update({ status: "captured" }).eq("id", body.id);
  const months = Number(payment.months || 1);
  const periodEnd = new Date(Date.now() + months * 30 * 24 * 3600_000).toISOString();
  if (payment.user_id) {
    await admin.from("profiles").update({ plan: "pro" }).eq("id", payment.user_id);
    await admin.from("subscriptions").insert({
      user_id: payment.user_id,
      plan: "pro",
      status: "active",
      gateway: "manual",
      current_period_end: periodEnd,
    });
    await admin.from("activity_log").insert({
      user_id: payment.user_id,
      message: `Manual payment approved — Pro active for ${months} month(s) until ${periodEnd.slice(0, 10)}`,
    });
  }
  return NextResponse.json({ ok: true, data: { status: "captured", periodEnd } });
}
