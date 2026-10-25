import { NextResponse } from "next/server";
import { recordWebhookEvent } from "@/lib/payments/store";
import {
  BINANCE_PRO_AMOUNT,
  BINANCE_PRO_CURRENCY,
  binanceConfigured,
  finalizeBinancePayment,
  pendingBinanceOrderUser,
  queryBinanceOrder,
} from "@/lib/payments/binance";

// Binance Pay order notification.
// Body shape (v2): { bizType: "PAY", data: "<JSON string with
// merchantTradeNo, transactionId, ...>", bizId, bizStatus: "PAY_SUCCESS" }.
// Binance retries a notification up to 6 times unless we answer HTTP
// 200 with { returnCode: "SUCCESS" }.
//
// Trust model: the notification is treated as a HINT, never as proof.
// On every PAY_SUCCESS we re-query the order from Binance's API
// server-to-server and only activate when Binance reports PAID for
// 19 USDT. A forged notification therefore activates nothing, and
// duplicates are killed by the webhook_events UNIQUE column + the
// payments UNIQUE gateway_payment_id.
export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  let body: { bizType?: string; bizStatus?: string; bizId?: unknown; data?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ returnCode: "SUCCESS", returnMessage: null });
  }
  if (body.bizType !== "PAY" || body.bizStatus !== "PAY_SUCCESS") {
    return NextResponse.json({ returnCode: "SUCCESS", returnMessage: null });
  }
  let data: { merchantTradeNo?: string; transactionId?: string };
  try {
    data = typeof body.data === "string" ? JSON.parse(body.data) : (body.data as typeof data);
  } catch {
    return NextResponse.json({ returnCode: "SUCCESS", returnMessage: null });
  }
  const merchantTradeNo = String(data.merchantTradeNo || "");
  if (!merchantTradeNo) {
    return NextResponse.json({ returnCode: "SUCCESS", returnMessage: null });
  }

  // Dedupe: same Binance event twice must not double-activate.
  const eventId = String(body.bizId || merchantTradeNo);
  if (await recordWebhookEvent("binance", eventId, "PAY_SUCCESS")) {
    return NextResponse.json({ returnCode: "SUCCESS", returnMessage: null });
  }
  if (!binanceConfigured()) {
    return NextResponse.json({ returnCode: "SUCCESS", returnMessage: null });
  }

  // Server-to-server confirmation before any activation.
  const status = await queryBinanceOrder(merchantTradeNo);
  if (!status) {
    // Binance API unreachable — ask Binance to retry by NOT acking.
    return NextResponse.json({ returnCode: "FAIL", returnMessage: "order query failed" });
  }
  if (!status.paid || status.currency !== BINANCE_PRO_CURRENCY || status.amount !== BINANCE_PRO_AMOUNT) {
    return NextResponse.json({ returnCode: "SUCCESS", returnMessage: null });
  }
  const owner = await pendingBinanceOrderUser(merchantTradeNo);
  if (!owner) {
    // No pending row (migration not applied, or order from elsewhere):
    // ack and let the return-path verify activate it instead.
    return NextResponse.json({ returnCode: "SUCCESS", returnMessage: null });
  }
  await finalizeBinancePayment({
    merchantTradeNo,
    transactionId: status.transactionId || merchantTradeNo,
    userId: owner.userId,
    email: owner.email,
  });
  return NextResponse.json({ returnCode: "SUCCESS", returnMessage: null });
}
