import type { Metadata } from "next";
import Link from "next/link";

// How it works, expanded from the homepage 3 steps. No new claims: every
// sentence reuses wording already live on the homepage, pricing page or FAQ.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://leadsforcegen.vercel.app";

export const metadata: Metadata = {
  title: "How it works — LeadsForceGen",
  description:
    "How LeadsForceGen works: create a free account, search any industry and city, get real businesses with the contacts they publish, then reach out. Free 30 leads a day, no card needed.",
  alternates: { canonical: `${SITE_URL}/how-it-works` },
};

const steps = [
  {
    n: "01",
    title: "Search",
    text: "Pick an industry and a city — Dubai, Kathmandu, New York and more. The search form takes any industry in plain words and any country, city or neighbourhood.",
  },
  {
    n: "02",
    title: "Get real leads",
    text: "Real businesses with the contacts they publish, scored and source-linked. Every lead carries phone, email, website, social profiles, address and opening hours where available — plus a quality score and the listing source, so you can verify before outreach.",
  },
  {
    n: "03",
    title: "Reach out",
    text: "Export to Excel or CSV, or generate an AI outreach message and start conversations. Pro accounts can download results as CSV, Excel, PDF or JSON from the dashboard, up to 500 leads per search. Every outreach message carries an opt-out line.",
  },
];

export default function HowItWorksPage() {
  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How LeadsForceGen works",
    description: "From search to conversation in minutes.",
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.text,
    })),
  };
  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-8 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }} />
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-accent-text">How it works</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
        From search to conversation in minutes
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        First, create a free account — no card needed, 30 leads a day. Then three steps:
      </p>

      <ol className="mt-8 grid gap-6 border-t-2 border-fg pt-6 md:grid-cols-3 md:gap-8">
        {steps.map((s) => (
          <li key={s.title}>
            <span className="font-mono text-2xl font-bold text-accent-text" aria-hidden="true">{s.n}</span>
            <h2 className="mt-2 font-display text-lg font-bold text-fg">{s.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
          </li>
        ))}
      </ol>

      <div className="mt-12 border-t-2 border-fg">
        <div className="border-b border-border py-5">
          <h2 className="font-display text-lg font-bold text-fg">What does each lead include?</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Every lead carries what the business itself publishes: phone, email, website,
            social profiles, address and opening hours where available — plus a quality score
            and the listing source, so you can verify before outreach.
          </p>
        </div>
        <div className="border-b border-border py-5">
          <h2 className="font-display text-lg font-bold text-fg">What does it cost?</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Free accounts get 30 leads every day, no card needed. Pro adds effectively
            unlimited searches plus CSV, Excel, PDF and JSON export and AI outreach messages.{" "}
            <Link href="/pricing" className="font-semibold text-accent-text underline underline-offset-2">
              See the pricing page for the full comparison
            </Link>
            .
          </p>
        </div>
        <div className="border-b border-border py-5">
          <h2 className="font-display text-lg font-bold text-fg">Where does the data come from?</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Public business data only: Overture Maps, OpenStreetMap, and the public websites
            of the businesses themselves. LeadsForceGen never scrapes social media or Google,
            never sells personal phone numbers or personal emails, and never invents a contact.
          </p>
        </div>
        <div className="border-b border-border py-5">
          <h2 className="font-display text-lg font-bold text-fg">How do I remove my business from the results?</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Use the{" "}
            <Link href="/unsubscribe" className="font-semibold text-accent-text underline underline-offset-2">
              remove a business
            </Link>{" "}
            page — your business is removed from all future results. Every outreach message
            also carries an opt-out line.
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/signup" className="btn-cta px-6">Start free</Link>
        <Link href="/pricing" className="btn-primary px-6">See pricing</Link>
      </div>
    </div>
  );
}
