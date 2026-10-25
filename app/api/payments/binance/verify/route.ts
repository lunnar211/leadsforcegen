import { NextResponse } from "next/server";
import { alreadyProcessed } from "@/lib/payments/store";
import { BINANCE_PRO_AMOUNT, BINANCE_PRO_CURRENCY, binanceConfigured, finalizeBinancePayment, queryBinanceOrder } from "@/lib/payments/binance";
import { getAuthUser } from "@/lib/quota";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Return-path verification: after paying on Binance, the user lands
// back on /checkout?binance_return=1 and taps "Verify payment". This
// route re-queries the order from Binance server-to-server and only
// activates Pro when Binance itself reports PAID for exactly 19 USDT.
// A client claim alone never upgrades anything.
export async function POST(req: Request) {
  if (!(await rateLimit(`binance-verify:${clientIp(req)}`, 20, 60_000))) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  if (!binanceConfigured()) {
    return NextResponse.json({ ok: false, error: "Binance Pay is not connected yet." }, { status: 503 });
  }
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in first — Pro activates on the account you are signed in with." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const merchantTradeNo = String(body.merchantTradeNo || "");
  const prepayId = String(body.prepayId || "");
  if (!merchantTradeNo) {
    return NextResponse.json({ ok: false, error: "Missing order reference. Start a Binance checkout first." }, { status: 400 });
  }

  const status = await queryBinanceOrder(merchantTradeNo, prepayId || undefined);
  if (!status) {
    return NextResponse.json({ ok: false, error: "Could not check the order with Binance. Please try again." }, { status: 502 });
  }
  if (!status.paid) {
    return NextResponse.json({ ok: false, error: `Payment not completed yet (Binance status: ${status.status}). Finish the payment in Binance, then verify again.` }, { status: 400 });
  }
  if (status.currency !== BINANCE_PRO_CURRENCY || status.amount !== BINANCE_PRO_AMOUNT) {
    return NextResponse.json({ ok: false, error: "Order amount does not match the Pro plan." }, { status: 400 });
  }
  const paymentId = status.transactionId || merchantTradeNo;
  if (await alreadyProcessed("payment", "binance", paymentId)) {
    return NextResponse.json({ ok: true, duplicate: true, message: "Payment already processed — Pro is active." });
  }
  const done = await finalizeBinancePayment({
    merchantTradeNo,
    transactionId: paymentId,
    userId: user.id,
    email: user.email || null,
  });
  if (!done) {
    return NextResponse.json({ ok: false, error: "Payment confirmed but activation failed. Contact support with your order reference." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, plan: "pro", message: "Binance payment verified. Pro activated." });
}
