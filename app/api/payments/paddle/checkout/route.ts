import { NextResponse } from "next/server";
import { getAuthUser, quotaConfigured } from "@/lib/quota";
import { paddleApiBase, paddleConfigured } from "@/lib/payments/plans";

// Paddle checkout (Merchant of Record, worldwide): creates a transaction
// server-side with the dashboard Price ID and the signed-in user's id in
// custom_data (the webhook trusts ONLY that + Paddle's signature).
// Returns Paddle's hosted checkout URL when the account provides one.
export async function POST(req: Request) {
  if (!paddleConfigured()) {
    return NextResponse.json({ ok: false, error: "Paddle checkout is not connected yet." }, { status: 503 });
  }
  // Fail closed like Lemon/Binance: without the account backend there is
  // no account a payment could upgrade, so never create an orphan guest
  // checkout (previously this fell through with userId null).
  if (!quotaConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Accounts are not connected yet, so Pro cannot be activated automatically. Please check back shortly." },
      { status: 503 },
    );
  }
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first, then try again." }, { status: 401 });
  const userId = user.id;
  const email = user.email ?? null;
  try {
    const res = await fetch(`${paddleApiBase()}/transactions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ price_id: process.env.PADDLE_PRICE_ID_PRO, quantity: 1 }],
        custom_data: { user_id: userId, email },
        // Ask Paddle for a hosted checkout URL for this transaction.
        checkout: { url: undefined },
      }),
    });
    const data = await res.json().catch(() => ({}));
    const txn = data?.data;
    const url = txn?.checkout?.url || null;
    if (!res.ok || !txn?.id) {
      return NextResponse.json({ ok: false, error: "Could not start Paddle checkout. Please try again shortly." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, data: { transactionId: txn.id, url } });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not reach Paddle. Please try again shortly." }, { status: 502 });
  }
}
