import { NextResponse } from "next/server";
import crypto from "crypto";
import { alreadyProcessed, recordPayment, recordWebhookEvent } from "@/lib/payments/store";

// Paddle webhook: the ONLY path that activates Pro from Paddle.
// Signature: header `paddle-signature: ts=<unix>;h1=<hex>` where h1 is
// HMAC-SHA256(webhook_secret, `${ts}:${rawBody}`). Events deduplicated
// via webhook_events; payments via UNIQUE gateway_payment_id.
function verifyPaddleSignature(raw: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(";").map((kv) => kv.split("=", 2).map((s) => s.trim())));
  const ts = parts.ts || "";
  const h1 = parts.h1 || "";
  if (!ts || !h1) return false;
  const ageSec = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(ageSec) || ageSec > 300) return false; // 5-minute tolerance
  const expected = crypto.createHmac("sha256", secret).update(`${ts}:${raw}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(h1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type PaddleEvent = {
  event_id?: string;
  event_type?: string;
  data?: {
    id?: string;
    status?: string;
    custom_data?: { user_id?: string; email?: string } | null;
    customer_id?: string;
    details?: { totals?: { total?: string; currency_code?: string } };
    items?: { price?: { id?: string } }[];
  };
};

export async function POST(req: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Paddle webhook not configured" }, { status: 503 });
  const raw = await req.text();
  const sig = req.headers.get("paddle-signature") || "";
  if (!verifyPaddleSignature(raw, sig, secret)) {
    return NextResponse.json({ error: "Invalid Paddle signature" }, { status: 400 });
  }
  let event: PaddleEvent;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const type = event.event_type || "";
  const data = event.data || {};
  const eventId = event.event_id || data.id || "";
  if (!eventId) return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  if (await recordWebhookEvent("paddle", eventId, type)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  const userId = data.custom_data?.user_id || null;
  const email = data.custom_data?.email || null;

  if (type === "transaction.completed") {
    // The transaction must contain OUR Pro price when items are listed.
    const expectedPrice = process.env.PADDLE_PRICE_ID_PRO || "";
    const priceIds = (data.items || []).map((i) => i.price?.id).filter(Boolean) as string[];
    const priceOk = !expectedPrice || priceIds.length === 0 || priceIds.includes(expectedPrice);
    const paymentId = `paddle_${data.id}`;
    if (priceOk && data.id && !(await alreadyProcessed("payment", "paddle", paymentId))) {
      await recordPayment({
        gateway: "paddle",
        gatewayPaymentId: paymentId,
        gatewayOrderId: data.id,
        userId,
        email,
        plan: "pro",
        amount: Number(data.details?.totals?.total || 0),
        currency: String(data.details?.totals?.currency_code || "USD"),
      });
    }
  }
  if (type === "subscription.canceled" || type === "subscription.past_due") {
    // Past-due keeps access during Paddle's dunning; only a full cancel
    // downgrades. (past_due intentionally does nothing yet.)
    if (type === "subscription.canceled" && (userId || email)) {
      const { serviceClient } = await import("@/lib/quota");
      const admin = serviceClient();
      if (admin && userId) await admin.from("profiles").update({ plan: "free" }).eq("id", userId);
      if (admin && !userId && email) await admin.from("profiles").update({ plan: "free" }).eq("email", email);
    }
  }
  return NextResponse.json({ ok: true });
}
