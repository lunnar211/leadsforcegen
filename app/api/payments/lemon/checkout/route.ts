import { NextResponse } from "next/server";
import { lemonConfigured } from "@/lib/payments/plans";
import { getAuthUser, quotaConfigured } from "@/lib/quota";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

// Creates a Lemon Squeezy hosted checkout for Pro. The variant (and its
// price) is fixed in the Lemon Squeezy dashboard; the buyer's user id is
// attached as custom data so the webhook can activate the right account.
export async function POST(req: Request) {
  if (!(await rateLimit(`lemon-checkout:${clientIp(req)}`, 10, 60_000))) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  if (!lemonConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Worldwide card payments are not connected yet. The owner needs to add the Lemon Squeezy keys in Vercel." },
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

  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://leadsforcegen.vercel.app";
  const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: user.email,
            custom: { user_id: user.id },
          },
          product_options: { redirect_url: `${site}/dashboard?upgraded=1` },
        },
        relationships: {
          store: { data: { type: "stores", id: String(process.env.LEMONSQUEEZY_STORE_ID) } },
          variant: { data: { type: "variants", id: String(process.env.LEMONSQUEEZY_VARIANT_ID_PRO) } },
        },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: "Lemon Squeezy could not create the checkout. Please try again." }, { status: 502 });
  }
  const data = (await res.json()) as { data?: { attributes?: { url?: string } } };
  const urlOut = data.data?.attributes?.url;
  if (!urlOut) {
    return NextResponse.json({ ok: false, error: "Checkout link missing. Please try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, data: { url: urlOut } });
}
