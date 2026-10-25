import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { MANUAL_METHODS, MANUAL_PRICES_NPR } from "@/lib/payments/plans";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sendAdminAlert } from "@/lib/telegram";

export const maxDuration = 30;

const MAX_PROOF_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// Magic-byte sniffing (sweep finding S1): the old check trusted the
// client-sent MIME type and extension, so executable bytes with a .png
// name and an image/png type were accepted as pending. Now the CONTENT
// must match the claimed image format, and the stored object gets the
// verified type — never the client-supplied one.
function sniffImage(bytes: Uint8Array, ext: string): boolean {
  if (ext === "png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    );
  }
  if (ext === "jpg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (ext === "webp") {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    );
  }
  return false;
}

const VERIFIED_TYPE: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

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

  // Coupon: the discount is recomputed HERE from the coupons table —
  // the client only sends a code, never an amount. Invalid/exhausted
  // codes are ignored (full price) rather than blocking the purchase,
  // but the response now SAYS SO (sweep finding P2) instead of silently
  // charging full price.
  const couponCode = String(form.get("coupon_code") || "").trim().toUpperCase();
  let amount = MANUAL_PRICES_NPR[months];
  let appliedCoupon: string | null = null;
  let couponState: "applied" | "invalid" | "unknown" = "unknown";
  const adminPre = createClient(url, service, { auth: { persistSession: false } });
  if (couponCode) {
    try {
      const { data } = await adminPre.from("coupons").select("percent_off, active, max_uses, used_count").eq("code", couponCode).limit(1);
      const c = data && data[0];
      if (c && c.active && (!c.max_uses || Number(c.used_count || 0) < Number(c.max_uses))) {
        amount = Math.max(1, Math.round(amount * (1 - Number(c.percent_off) / 100)));
        appliedCoupon = couponCode;
        couponState = "applied";
      } else {
        couponState = "invalid";
      }
    } catch { /* coupons table not created yet — charge full price */ }
  }

  const admin = adminPre;
  const proofId = `manual_${crypto.randomUUID()}`;
  const path = `${userData.user.id}/${proofId}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Content check before anything is stored (S1).
  if (!sniffImage(bytes, ext)) {
    return NextResponse.json({ ok: false, error: "That file is not a real PNG, JPG, or WebP image." }, { status: 400 });
  }
  // Duplicate-proof guard (sweep finding P1): the same user re-uploading
  // an identical file while one is pending gets the EXISTING record
  // back — no second pending row, no second upload. The proof_hash
  // column arrives with the security-fixes migration; until it runs,
  // the lookup errors and we proceed exactly as before.
  const proofHash = createHash("sha256").update(bytes).digest("hex");
  try {
    const { data: dup } = await admin
      .from("payments")
      .select("id, amount, currency, months, method, status")
      .eq("user_id", userData.user.id)
      .eq("proof_hash", proofHash)
      .eq("status", "pending")
      .limit(1);
    if (dup && dup[0]) {
      return NextResponse.json({
        ok: true,
        data: { id: dup[0].id, status: "pending", amount: dup[0].amount, currency: dup[0].currency, months: dup[0].months, method: dup[0].method, coupon: null, duplicate: true },
      });
    }
  } catch { /* proof_hash column not migrated yet — no dedupe */ }
  const { error: upErr } = await admin.storage.from("payment-proofs").upload(path, bytes, { contentType: VERIFIED_TYPE[ext] });
  if (upErr) {
    return NextResponse.json({ ok: false, error: "Could not store the proof. Please try again." }, { status: 502 });
  }
  const baseRow = {
    user_id: userData.user.id,
    email: userData.user.email,
    gateway: "manual",
    gateway_payment_id: proofId,
    plan: "pro",
    amount,
    currency: "NPR",
    status: "pending",
    method,
    months,
    proof_path: path,
  };
  // proof_hash / coupon_code exist in the DB only after the latest
  // schema runs; the typed client doesn't know the columns yet, hence
  // the casts. Try the fullest row first, then shed optional columns.
  const rowVariants = [
    { ...baseRow, proof_hash: proofHash, ...(appliedCoupon ? { coupon_code: appliedCoupon } : {}) },
    { ...baseRow, proof_hash: proofHash },
    { ...baseRow, ...(appliedCoupon ? { coupon_code: appliedCoupon } : {}) },
    baseRow,
  ];
  let paymentId: string | null = null;
  for (const row of rowVariants) {
    const { data, error } = await admin.from("payments").insert(row as never).select("id").single();
    if (!error && data) {
      paymentId = (data as { id: string }).id;
      break;
    }
  }
  if (!paymentId) {
    return NextResponse.json({ ok: false, error: "Could not record the payment. Please try again." }, { status: 502 });
  }
  if (appliedCoupon) {
    // Count the use (best-effort; RPC-free increment via read-modify-write
    // is fine at this volume, and a failure never blocks the buyer).
    try {
      const { data } = await admin.from("coupons").select("id, used_count").eq("code", appliedCoupon).limit(1);
      if (data && data[0]) await admin.from("coupons").update({ used_count: Number(data[0].used_count || 0) + 1 }).eq("id", data[0].id);
    } catch { /* ignore */ }
  }
  // Fail-open admin alert so the proof gets reviewed fast. Deliberately
  // NOT awaited (the previous version awaited sendTelegram, so a
  // Telegram outage added latency to the buyer's response). Never
  // throws, never blocks. No proof file content, no storage path, no
  // instruction body — only what the admin needs to review. Duplicate
  // submissions return early above and do not re-alert.
  sendAdminAlert(
    `Payment proof submitted: ${userData.user.email || "a buyer"}, gateway ${method}, amount ${amount} NPR, pending approval in /admin`,
  );
  return NextResponse.json({
    ok: true,
    data: {
      id: paymentId,
      status: "pending",
      amount,
      currency: "NPR",
      months,
      method,
      coupon: appliedCoupon,
      ...(couponState === "invalid" ? { coupon_warning: "That code is not valid, so the full amount applies." } : {}),
    },
  });
}
