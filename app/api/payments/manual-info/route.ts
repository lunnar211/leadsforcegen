import { NextResponse } from "next/server";
import { MANUAL_METHODS, MANUAL_PRICES_NPR } from "@/lib/payments/plans";
import { getAuthUser } from "@/lib/quota";
import { clientIp, rateLimit } from "@/lib/rate-limit";

import { connection } from "next/server";

// Manual-payment info — SIGNED-IN USERS ONLY.
//
// Privacy fix (2026-10-25): this route used to be public, so anyone
// (including scrapers) could fetch the owner's receiving instructions
// — including bank account details — without even logging in. Bank
// account numbers are far more sensitive than a wallet number: with
// name + bank + account number, a scammer can attempt social
// engineering against the bank. So:
//   1. The route now requires a signed-in session (401 otherwise).
//   2. The checkout UI additionally hides the instructions behind a
//      click-to-reveal, so they never sit in the initial page render.
//   3. The route is rate-limited to slow credential-scraping.
// The details themselves live ONLY in the MANUAL_PAYMENT_INSTRUCTIONS
// env var (edited by the owner in Vercel) — never in code, and no
// bank QR image is ever added to the repo.
export async function GET(req: Request) {
  await connection();
  if (!(await rateLimit(`manual-info:${clientIp(req)}`, 30, 60_000))) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Log in to see manual payment details." }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    data: {
      methods: MANUAL_METHODS,
      pricesNpr: MANUAL_PRICES_NPR,
      currency: "NPR",
      instructions: process.env.MANUAL_PAYMENT_INSTRUCTIONS || null,
      storageConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
  });
}
