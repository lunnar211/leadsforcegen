import { NextResponse } from "next/server";
import crypto from "crypto";
import { PLANS } from "@/lib/payments/plans";
import { alreadyProcessed, recordPayment } from "@/lib/payments/store";


function timingSafeEqualHex(a: string, b: string) {
  const ba = Buffer.from(a); const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Server-side verification for Razorpay checkout callbacks.
// A client-side "success" callback alone NEVER upgrades a plan: this route
// (1) checks the HMAC-SHA256 signature, (2) re-fetches the payment from
// Razorpay and requires status=captured, (3) requires amount + currency to
// match the server-side plan map, and (4) skips already-processed payment
// IDs so replays / double clicks cannot double-upgrade.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, email, userId } = body as Record<string, string>;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return NextResponse.json({ error: "Razorpay not configured" }, { status: 503 });
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    return NextResponse.json({ error: "Missing payment fields" }, { status: 400 });

  const expected = crypto.createHmac("sha256", secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
  if (!timingSafeEqualHex(expected, razorpay_signature))
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  // Duplicate / replay protection.
  if (await alreadyProcessed("payment", "razorpay", razorpay_payment_id))
    return NextResponse.json({ ok: true, duplicate: true, message: "Payment already processed — no duplicate upgrade." });

  // Re-fetch from Razorpay — do not trust the client's word about the amount.
  try {
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${secret}`).toString("base64");
    const res = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) return NextResponse.json({ error: "Could not fetch payment from Razorpay" }, { status: 502 });
    const payment = await res.json();
    if (payment.status !== "captured")
      return NextResponse.json({ error: `Payment not captured (status: ${payment.status})` }, { status: 400 });
    if (payment.order_id !== razorpay_order_id)
      return NextResponse.json({ error: "Order mismatch" }, { status: 400 });
    if (payment.amount !== PLANS.pro.razorpay.amount || payment.currency !== PLANS.pro.razorpay.currency)
      return NextResponse.json({ error: "Amount / currency does not match the Pro plan" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Payment verification request failed" }, { status: 502 });
  }

  await recordPayment({
    gateway: "razorpay", gatewayPaymentId: razorpay_payment_id, gatewayOrderId: razorpay_order_id,
    userId: userId || null, email: email || null, plan: "pro",
    amount: PLANS.pro.razorpay.amount, currency: PLANS.pro.razorpay.currency,
  });
  return NextResponse.json({ ok: true, plan: "pro", message: "Payment verified on the server. Pro activated." });
}
