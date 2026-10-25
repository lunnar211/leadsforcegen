import { NextResponse } from "next/server";
import { PLANS, gatewayConfigured, type Gateway } from "@/lib/payments/plans";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { blockedResponse, isIpBlocked, recordAbuseEvent } from "@/lib/ip-blocks";


// Creates a payment order / checkout session on the SERVER.
// The amount/price always comes from the server-side PLANS map (or the
// Stripe Price ID configured in env) — never from the client request.
export async function POST(req: Request) {
  // IP block check FIRST (fail-open until the owner applies
  // supabase/ip-blocks.sql): generic 403 before any gateway work.
  // Also rate-limited (30 creations / minute / IP, far above any human
  // checkout flow): repeated trips count toward a 24h IP block.
  const ip = clientIp(req);
  if (await isIpBlocked(ip)) return blockedResponse();
  if (!(await rateLimit(`create-order:${ip}`, 30, 60_000))) {
    await recordAbuseEvent(ip, "payment_abuse");
    return NextResponse.json({ error: "Too many checkout attempts from this connection. Try again later." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const gateway = (body.gateway === "stripe" ? "stripe" : "razorpay") as Gateway;
  const plan = PLANS.pro; // only paid plan in this MVP; ignore any client-sent amount/plan price
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (!gatewayConfigured(gateway)) {
    return NextResponse.json(
      { error: `${gateway} is not configured. Set the ${gateway.toUpperCase()} env vars in Vercel / .env.local to enable checkout.`, configured: false },
      { status: 503 },
    );
  }

  try {
    if (gateway === "razorpay") {
      const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: plan.razorpay.amount,
          currency: plan.razorpay.currency,
          receipt: `lfg_${Date.now()}`,
          notes: { plan: plan.id, product: "LeadsForceGen" },
        }),
      });
      if (!res.ok) return NextResponse.json({ error: "Razorpay order creation failed" }, { status: 502 });
      const order = await res.json();
      return NextResponse.json({ gateway, orderId: order.id, amount: plan.razorpay.amount, currency: plan.razorpay.currency, plan: plan.id });
    }

    // Stripe Checkout session via REST API (no SDK needed).
    const form = new URLSearchParams({
      mode: "payment",
      success_url: `${site}/checkout?status=success`,
      cancel_url: `${site}/checkout?status=cancelled`,
      "line_items[0][price]": process.env.STRIPE_PRICE_ID_PRO as string,
      "line_items[0][quantity]": "1",
      "metadata[plan]": plan.id,
      "metadata[product]": "LeadsForceGen",
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) return NextResponse.json({ error: "Stripe session creation failed" }, { status: 502 });
    const session = await res.json();
    return NextResponse.json({ gateway, sessionId: session.id, url: session.url, plan: plan.id });
  } catch {
    return NextResponse.json({ error: "Payment gateway request failed" }, { status: 502 });
  }
}
