import { connection } from "next/server";
import { gatewayConfigured, lemonConfigured } from "@/lib/payments/plans";

// Which payment options are actually connected on the server. Returns
// booleans ONLY — never key values — so the checkout page can show just
// the options that work and hide the ones the owner has not connected.
export async function GET() {
  await connection();
  return Response.json({
    lemon: lemonConfigured(),
    razorpay: gatewayConfigured("razorpay"),
    stripe: gatewayConfigured("stripe"),
    manual: Boolean(process.env.MANUAL_PAYMENT_INSTRUCTIONS),
  });
}
