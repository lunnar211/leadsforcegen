import { NextResponse } from "next/server";
import { MANUAL_METHODS, MANUAL_PRICES_NPR } from "@/lib/payments/plans";

// Public checkout info for manual payments: prices (server map) and the
// owner's receiving instructions from MANUAL_PAYMENT_INSTRUCTIONS.
// No secrets are exposed here — only what a buyer needs to pay.
export async function GET() {
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
