import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing — LeadsForceGen",
  description:
    "LeadsForceGen pricing: free plan with 30 leads a day, Pro with effectively unlimited searches, exports and AI outreach. Card worldwide, eSewa/Khalti/bank in Nepal.",
  alternates: { canonical: "/pricing" },
};

const FREE_FEATURES = [
  "30 leads every day, no card needed",
  "Search any industry in plain words, any city",
  "Phone, email, website and social links per lead",
  "Quality score and listing source on every lead",
];

const PRO_FEATURES = [
  "Effectively unlimited searches (fair-use 100,000 leads/day)",
  "Up to 500 leads per search",
  "Export to CSV, Excel, PDF and JSON",
  "AI outreach messages with an opt-out line",
  "One-click website extraction",
  "Priority on new cities as coverage expands",
];

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-8 sm:py-10">
      <h1 className="text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">Pricing</h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        Start free. Upgrade when the leads start paying for themselves. No hidden fees, cancel anytime from your account.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-xl font-bold text-fg">Free</h2>
          <p className="mt-2 text-3xl font-extrabold text-fg">$0 <span className="text-base font-medium text-muted">forever</span></p>
          <ul className="mt-4 space-y-2 text-sm text-fg">
            {FREE_FEATURES.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          <Link href="/signup" className="btn-ghost mt-6 inline-block px-6">Create free account</Link>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-bold text-fg">Pro</h2>
          <p className="mt-2 text-3xl font-extrabold text-fg">$19 <span className="text-base font-medium text-muted">/ month</span></p>
          <p className="mt-1 text-sm text-muted">or NPR 2,399 / month, 6,499 / 3 months, 19,999 / 12 months via eSewa, Khalti or bank transfer.</p>
          <ul className="mt-4 space-y-2 text-sm text-fg">
            {PRO_FEATURES.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          <Link href="/checkout" className="btn-cta mt-6 inline-block px-6">Go Pro</Link>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted">
        Every lead comes from public business listings and the businesses&apos; own websites — never guessed, never scraped
        from social platforms. Verify a lead before outreach. Businesses can be removed from all future results at any time
        from the unsubscribe page.
      </p>
      <p className="mt-2 text-sm">
        <Link href="/unsubscribe" className="underline">Remove a business</Link>
        {" · "}
        <Link href="/terms" className="underline">Terms</Link>
        {" · "}
        <Link href="/privacy" className="underline">Privacy</Link>
      </p>
    </div>
  );
}
