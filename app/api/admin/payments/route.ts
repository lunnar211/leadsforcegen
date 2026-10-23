import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_COOKIE, verifyAdminSessionToken } from "@/lib/adminAuth";
import { reviewManualPayment } from "@/lib/manualPayments";

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
  // Shared with the Telegram admin bot (lib/manualPayments) so both
  // review paths apply exactly the same effects.
  const result = await reviewManualPayment(admin, body.id, body.action);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  return NextResponse.json({ ok: true, data: { status: result.status, periodEnd: result.periodEnd } });
}
