import "server-only";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// Binance Pay merchant integration (one-time Pro payment, USDT).
//
// Docs: merchant.binance.com — Developers → API. Base endpoint
// https://bpay.binanceapi.com. Request signing: HMAC-SHA512 over
//   timestamp + "\n" + nonce + "\n" + body + "\n"
// hex-encoded UPPERCASE, sent as BinancePay-Signature with the
// BinancePay-Timestamp (ms), BinancePay-Nonce (32 chars) and
// BinancePay-Certificate-SN (the API key) headers.
//
// Security shape (mirrors the Razorpay verify route):
// - No client-sent amount is ever trusted: Pro is always 19 USDT here.
// - A webhook notification alone NEVER activates Pro. The webhook (and
//   the return-path verify route) re-query the order from Binance's
//   API server-to-server and require status PAID + 19 USDT before
//   anything is recorded. A forged notification therefore activates
//   nothing, and a Binance retry can never double-upgrade (the
//   payments + webhook_events UNIQUE columns + the finalize update).
// - The merchantTradeNo → user mapping lives in a PENDING payments
//   row (status 'pending'), created at checkout. It needs the
//   supabase/binance-pay.sql migration (adds 'binance' to the gateway
//   check) — until that SQL is applied, webhook auto-activation is
//   unavailable but the verify button still works, because verify
//   identifies the user from their session, not from the pending row.
//
// Env (Vercel Production, sensitive): BINANCE_PAY_API_KEY,
// BINANCE_PAY_SECRET_KEY. Webhook URL to set in the Binance merchant
// portal: https://leadsforcegen.vercel.app/api/payments/binance/webhook

export const BINANCE_BASE = "https://bpay.binanceapi.com";
export const BINANCE_PRO_AMOUNT = 19;
export const BINANCE_PRO_CURRENCY = "USDT";

export function binanceConfigured(): boolean {
  return Boolean(process.env.BINANCE_PAY_API_KEY && process.env.BINANCE_PAY_SECRET_KEY);
}

function nonce32(): string {
  return crypto.randomBytes(24).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 32).padEnd(32, "0");
}

function sign(timestamp: string, nonce: string, body: string): string {
  const payload = `${timestamp}\n${nonce}\n${body}\n`;
  return crypto.createHmac("sha512", process.env.BINANCE_PAY_SECRET_KEY as string).update(payload).digest("hex").toUpperCase();
}

async function binancePost(path: string, bodyObj: Record<string, unknown>): Promise<{ ok: boolean; status: number; json: unknown }> {
  const body = JSON.stringify(bodyObj);
  const timestamp = String(Date.now());
  const nonce = nonce32();
  const res = await fetch(`${BINANCE_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "BinancePay-Timestamp": timestamp,
      "BinancePay-Nonce": nonce,
      "BinancePay-Certificate-SN": process.env.BINANCE_PAY_API_KEY as string,
      "BinancePay-Signature": sign(timestamp, nonce, body),
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export type BinanceOrder = {
  merchantTradeNo: string;
  prepayId: string;
  checkoutUrl: string;
  qrContent?: string;
  qrcodeLink?: string;
};

export async function createBinanceOrder(merchantTradeNo: string, returnUrl: string): Promise<BinanceOrder | null> {
  const { ok, json } = await binancePost("/binancepay/openapi/v2/order", {
    env: { terminalType: "WEB" },
    merchantTradeNo,
    orderAmount: BINANCE_PRO_AMOUNT,
    currency: BINANCE_PRO_CURRENCY,
    goods: {
      goodsType: "01",
      goodsCategory: "0000",
      referenceGoodsId: "pro",
      goodsName: "LeadsForceGen Pro",
    },
    returnUrl,
  });
  const data = (json as { status?: string; data?: Record<string, unknown> }).data;
  if (!ok || (json as { status?: string }).status !== "SUCCESS" || !data?.checkoutUrl) return null;
  return {
    merchantTradeNo,
    prepayId: String(data.prepayId || ""),
    checkoutUrl: String(data.checkoutUrl),
    qrContent: data.qrContent ? String(data.qrContent) : undefined,
    qrcodeLink: data.qrcodeLink ? String(data.qrcodeLink) : undefined,
  };
}

export type BinanceOrderStatus = {
  paid: boolean;
  status: string;
  transactionId: string;
  amount: number;
  currency: string;
};

/** Server-to-server truth: is this Binance order actually PAID for 19 USDT? */
export async function queryBinanceOrder(merchantTradeNo: string, prepayId?: string): Promise<BinanceOrderStatus | null> {
  const body: Record<string, unknown> = { merchantTradeNo };
  if (prepayId) body.prepayId = prepayId;
  const { ok, json } = await binancePost("/binancepay/openapi/v2/order/query", body);
  const data = (json as { status?: string; data?: Record<string, unknown> }).data;
  if (!ok || (json as { status?: string }).status !== "SUCCESS" || !data) return null;
  const status = String(data.status || "");
  return {
    paid: status === "PAID",
    status,
    transactionId: String(data.transactionId || ""),
    amount: Number(data.orderAmount ?? data.totalFee ?? 0),
    currency: String(data.currency || ""),
  };
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Finalize a confirmed Binance payment: mark the pending row captured
 * (or insert a captured row when no pending row exists, e.g. the SQL
 * migration was applied after checkout) and upgrade the profile.
 * Idempotent: a second call for the same order updates 0 rows and the
 * captured row's UNIQUE gateway_payment_id blocks any duplicate.
 */
export async function finalizeBinancePayment(opts: {
  merchantTradeNo: string;
  transactionId: string;
  userId: string | null;
  email: string | null;
}): Promise<boolean> {
  const sb = serviceClient();
  if (!sb) return false;
  try {
    const { data: updated } = await sb
      .from("payments")
      .update({ status: "captured", gateway_payment_id: opts.transactionId || opts.merchantTradeNo })
      .eq("gateway", "binance")
      .eq("gateway_order_id", opts.merchantTradeNo)
      .eq("status", "pending")
      .select("id");
    if (!updated || updated.length === 0) {
      await sb.from("payments").upsert(
        {
          gateway: "binance",
          gateway_payment_id: opts.transactionId || opts.merchantTradeNo,
          gateway_order_id: opts.merchantTradeNo,
          user_id: opts.userId || null,
          email: opts.email || null,
          plan: "pro",
          amount: BINANCE_PRO_AMOUNT,
          currency: BINANCE_PRO_CURRENCY,
          status: "captured",
        },
        { onConflict: "gateway_payment_id", ignoreDuplicates: true },
      );
    }
    if (opts.userId) await sb.from("profiles").update({ plan: "pro" }).eq("id", opts.userId);
    else if (opts.email) await sb.from("profiles").update({ plan: "pro" }).eq("email", opts.email);
    return true;
  } catch {
    return false;
  }
}

/** Resolve the user a pending Binance order belongs to (webhook path). */
export async function pendingBinanceOrderUser(merchantTradeNo: string): Promise<{ userId: string | null; email: string | null } | null> {
  const sb = serviceClient();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from("payments")
      .select("user_id, email")
      .eq("gateway", "binance")
      .eq("gateway_order_id", merchantTradeNo)
      .limit(1);
    if (!data || data.length === 0) return null;
    return { userId: (data[0].user_id as string | null) || null, email: (data[0].email as string | null) || null };
  } catch {
    return null;
  }
}
