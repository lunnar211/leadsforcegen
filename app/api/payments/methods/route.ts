import { connection } from "next/server";
import { binanceConfigured, gatewayConfigured, lemonConfigured, paddleConfigured } from "@/lib/payments/plans";

// Which payment options are actually connected on the server. Returns
// booleans ONLY — never key values — so the checkout page can show just
// the options that work and hide the ones the owner has not connected.
// `country` is the visitor's country from Vercel's edge header, so the
// checkout can lead with the payment method that fits their country
// (Nepal → eSewa/Khalti manual; elsewhere → card checkout). The visitor
// can always switch the selector manually.
export async function GET(req: Request) {
  await connection();
  const country = (req.headers.get("x-vercel-ip-country") || "").toUpperCase();
  return Response.json({
    lemon: lemonConfigured(),
    paddle: paddleConfigured(),
    binance: binanceConfigured(),
    razorpay: gatewayConfigured("razorpay"),
    stripe: gatewayConfigured("stripe"),
    manual: Boolean(process.env.MANUAL_PAYMENT_INSTRUCTIONS),
    country: /^[A-Z]{2}$/.test(country) ? country : null,
  });
}
