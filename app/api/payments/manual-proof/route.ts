import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { MANUAL_METHODS, MANUAL_PRICES_NPR } from "@/lib/payments/plans";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

const MAX_PROOF_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// A buyer submits payment proof for a manual (eSewa/Khalti/bank) payment.
// The amount comes ONLY from the server price map (months -> NPR). The
// payment row is created as status='pending'; Pro activates only when the
// admin approves it in /api/admin/payments. Requires a signed-in user so
// the approval upgrades the right account.
export async function POST(req: Request) {
  if (!(await rateLimit(`manual-proof:${clientIp(req)}`, 5, 60_000))) {
    return NextResponse.json({ ok: false, error: "Too many submissions. Try again in a minute." }, { status: 429 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return NextResponse.json({ ok: false, error: "Manual payments are not configured on the server yet." }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Sign in first, then submit your payment proof." }, { status: 401 });
  }
  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ ok: false, error: "Your session is not valid. Sign in again." }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Expected a form upload." }, { status: 400 });
  const method = String(form.get("method") || "");
  const months = Number(form.get("months") || 0);
  const file = form.get("proof");
  if (!(MANUAL_METHODS as readonly string[]).includes(method)) {
    return NextResponse.json({ ok: false, error: "Choose eSewa, Khalti, or bank transfer." }, { status: 400 });
  }
  if (!MANUAL_PRICES_NPR[months]) {
    return NextResponse.json({ ok: false, error: "Choose 1, 3, or 12 months." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Attach a screenshot/photo of your payment." }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ ok: false, error: "Proof must be a PNG, JPG, or WebP image." }, { status: 400 });
  }
  if (file.size > MAX_PROOF_BYTES) {
    return NextResponse.json({ ok: false, error: "Proof image must be 2 MB or smaller." }, { status: 400 });
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const proofId = `manual_${crypto.randomUUID()}`;
  const path = `${userData.user.id}/${proofId}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from("payment-proofs").upload(path, bytes, { contentType: file.type });
  if (upErr) {
    return NextResponse.json({ ok: false, error: "Could not store the proof. Please try again." }, { status: 502 });
  }
  const { error: insErr } = await admin.from("payments").insert({
    user_id: userData.user.id,
    email: userData.user.email,
    gateway: "manual",
    gateway_payment_id: proofId,
    plan: "pro",
    amount: MANUAL_PRICES_NPR[months],
    currency: "NPR",
    status: "pending",
    method,
    months,
    proof_path: path,
  });
  if (insErr) {
    return NextResponse.json({ ok: false, error: "Could not record the payment. Please try again." }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    data: { status: "pending", amount: MANUAL_PRICES_NPR[months], currency: "NPR", months, method },
  });
}
