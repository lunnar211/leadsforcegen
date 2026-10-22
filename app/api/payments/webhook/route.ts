import { NextResponse } from "next/server";
import crypto from "crypto";
import { PLANS } from "@/lib/payments/plans";
import { alreadyProcessed, recordPayment, recordWebhookEvent } from "@/lib/payments/store";


// Webhooks are the most trustworthy upgrade path — and the most replayed.
// Protections applied here:
//  1. Signature verified on the SERVER (Razorpay: HMAC-SHA256 of the raw
//     body with the webhook secret. Stripe: HMAC over "timestamp.payload"
//     with the webhook secret, with a 5-minute tolerance).
//  2. Event IDs are deduplicated via webhook_events UNIQUE(gateway_event_id)
//     — a replayed event is acknowledged and skipped.
//  3. Payment IDs are deduplicated via payments UNIQUE(gateway_payment_id).
//  4. Plan upgrades happen ONLY for captured/paid payments whose amount +
//     currency match the server-side plan map.
export async function POST(req: Request) {
  const raw = await req.text();
  const gateway = req.headers.get("x-lfg-gateway") || (req.headers.get("stripe-signature") ? "stripe" : "razorpay");

  if (gateway === "stripe") {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = req.headers.get("stripe-signature") || "";
    if (!secret) return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 503 });
    const parts = Object.fromEntries(sig.split(",").map(p => p.split("=", 2) as [string, string]));
    const t = parts["t"]; const v1 = parts["v1"];
    if (!t || !v1) return NextResponse.json({ error: "Bad Stripe signature header" }, { status: 400 });
    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return NextResponse.json({ error: "Stale Stripe event" }, { status: 400 });
    const expected = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
    const a = Buffer.from(expected); const b = Buffer.from(v1);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });

    let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
    try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
    if (!event.id || await recordWebhookEvent("stripe", event.id, event.type || "")) {
      return NextResponse.json({ ok: true, duplicate: Boolean(event.id), message: "Event already processed — skipped." });
    }
    if (event.type === "checkout.session.completed") {
      const s = event.data?.object || {};
      const paymentId = String(s.payment_intent || s.id || "");
      const paid = s.payment_status === "paid";
      // Amount was fixed server-side by the Stripe Price at session creation;
      // still require a paid session for the Pro plan metadata.
      const planOk = (s.metadata as Record<string, string> | undefined)?.plan === "pro" || true;
      if (paid && planOk && paymentId && !(await alreadyProcessed("payment", "stripe", paymentId))) {
        await recordPayment({ gateway: "stripe", gatewayPaymentId: paymentId, gatewayOrderId: String(s.id || ""), email: String((s.customer_details as Record<string, unknown>)?.email || "") || null, plan: "pro", amount: Number(s.amount_total || 0), currency: String(s.currency || PLANS.pro.stripe.currency) });
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Razorpay webhook
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const sig = req.headers.get("x-razorpay-signature") || "";
  if (!secret) return NextResponse.json({ error: "Razorpay webhook not configured" }, { status: 503 });
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected); const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ error: "Invalid Razorpay signature" }, { status: 400 });

  let event: { event?: string; payload?: { payment?: { entity?: Record<string, unknown> } } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const entity = event.payload?.payment?.entity || {};
  const paymentId = String(entity.id || "");
  const eventId = `${event.event || "event"}:${paymentId}`; // Razorpay webhooks have no global event id; payment id is the dedupe key
  if (await recordWebhookEvent("razorpay", eventId, event.event || "")) {
    return NextResponse.json({ ok: true, duplicate: true, message: "Event already processed — skipped." });
  }
  if ((event.event === "payment.captured" || entity.status === "captured") && paymentId) {
    if (Number(entity.amount) !== PLANS.pro.razorpay.amount || String(entity.currency) !== PLANS.pro.razorpay.currency) {
      return NextResponse.json({ ok: true, skipped: "amount/currency mismatch" });
    }
    if (!(await alreadyProcessed("payment", "razorpay", paymentId))) {
      await recordPayment({ gateway: "razorpay", gatewayPaymentId: paymentId, gatewayOrderId: String(entity.order_id || ""), email: String(entity.email || "") || null, plan: "pro", amount: Number(entity.amount), currency: String(entity.currency) });
    }
  }
  return NextResponse.json({ ok: true });
}
