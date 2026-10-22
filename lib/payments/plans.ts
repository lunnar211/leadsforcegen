// SERVER-SIDE plan / price map. Amounts are defined ONLY here (and in the
// gateway dashboard for Stripe Price IDs). Amounts sent by the client are
// NEVER trusted — checkout and verification both read from this map.
export const PLANS = {
  pro: {
    id: "pro",
    name: "LeadsForceGen Pro",
    displayPrice: "$19/mo",
    // Razorpay charges in the smallest currency unit (paise for INR).
    razorpay: { amount: 149900, currency: "INR" }, // ₹1,499
    // Stripe charges via a Price created in the Stripe dashboard
    // (STRIPE_PRICE_ID_PRO); the session amount comes from that Price.
    stripe: { currency: "usd" },
  },
} as const;

// Manual payments (eSewa / Khalti / bank transfer) priced in NPR.
// Server-side only — the client picks months + method, never an amount.
// Owner: adjust these numbers here if your pricing changes.
export const MANUAL_PRICES_NPR: Record<number, number> = {
  1: 2399, // ~1 month of Pro ($19)
  3: 6499, // 3 months
  12: 19999, // 12 months
};
export const MANUAL_METHODS = ["esewa", "khalti", "bank"] as const;
export type ManualMethod = (typeof MANUAL_METHODS)[number];

export type PlanId = keyof typeof PLANS;
export type Gateway = "razorpay" | "stripe";

export function gatewayConfigured(gateway: Gateway): boolean {
  if (gateway === "razorpay") return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID_PRO);
}
