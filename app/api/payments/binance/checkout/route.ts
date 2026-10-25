import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { binanceConfigured, createBinanceOrder } from "@/lib/payments/binance";
import { getAuthUser, quotaConfigured } from "@/lib/quota";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

// Creates a Binance Pay order for Pro (19 USDT). The user pays on
// Binance's hosted checkout (checkoutUrl) or by scanning the QR code.
// Activation happens via the Binance webhook, or via the verify button
// on the checkout page after the user returns — the checkout call
// itself never upgrades anything.
export async function POST(req: Request) {
  if (!(await rateLimit(`binance-checkout:${clientIp(req)}`, 10, 60_000))) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  if (!binanceConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Binance Pay is not connected yet. The owner needs to add the Binance merchant keys in Vercel." },
      { status: 503 },
    );
  }
  if (!quotaConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Accounts are not connected yet, so Pro cannot be activated automatically. Please check back shortly." },
      { status: 503 },
    );
  }
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in first — your Pro activates on the account you are signed in with." }, { status: 401 });
  }

  const merchantTradeNo = `lfg${Date.now()}${crypto.randomBytes(3).toString("hex")}`;
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://leadsforcegen.vercel.app";
  const order = await createBinanceOrder(merchantTradeNo, `${site}/checkout?binance_return=1`);
  if (!order) {
    return NextResponse.json({ ok: false, error: "Binance Pay could not create the order. Please try again." }, { status: 502 });
  }

  // Pending mapping row for the webhook path. If the binance-pay.sql
  // migration has not been applied yet, this insert fails (gateway
  // check) and is skipped — the verify button still works, because it
  // identifies the user from their session instead of this row.
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false },
    });
    await sb.from("payments").insert({
      gateway: "binance",
      gateway_order_id: merchantTradeNo,
      user_id: user.id,
      email: user.email || null,
      plan: "pro",
      amount: 19,
      currency: "USDT",
      status: "pending",
    });
  } catch { /* pending row is best-effort; verify path does not need it */ }

  return NextResponse.json({ ok: true, data: order });
}
