import type { Metadata } from "next";
import Link from "next/link";
import { SEO_CITIES, formatCount } from "@/lib/seo-pages";

// Site-wide FAQ, built from the FAQ content already published on the
// /leads/* pages plus the questions the homepage and dashboard leave
// unanswered (scoring, coverage, cost). No new claims: every answer
// reuses wording already live on the site.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://leadsforcegen.vercel.app";

export const metadata: Metadata = {
  title: "FAQ — How LeadsForceGen Works",
  description:
    "Frequently asked questions about LeadsForceGen: what contact details each lead includes, how the lead score works, which cities are covered, and what Free and Pro cost.",
  alternates: { canonical: `${SITE_URL}/faq` },
};

const liveCities = SEO_CITIES.filter((c) => c.live);

const faqs: { q: string; a: React.ReactNode; text: string }[] = [
  {
    q: "What contact details do I get for each lead?",
    a: "Every lead carries what the business itself publishes: phone, email, website, social profiles, address and opening hours where available — plus a quality score and the listing source, so you can verify before outreach.",
    text: "Every lead carries what the business itself publishes: phone, email, website, social profiles, address and opening hours where available — plus a quality score and the listing source, so you can verify before outreach.",
  },
  {
    q: "Are these leads verified?",
    a: "Leads come from licensed public business listings (Overture Maps) and the businesses' own websites — never guessed or invented. Email domains are checked for valid mail records, and every lead shows its source. We still recommend a quick verification before outreach.",
    text: "Leads come from licensed public business listings (Overture Maps) and the businesses' own websites — never guessed or invented. Email domains are checked for valid mail records, and every lead shows its source. We still recommend a quick verification before outreach.",
  },
  {
    q: "How does the lead score work?",
    a: "Score = published phone + email + website + source quality. A lead that publishes a phone, an email and a website from its own pages scores higher than one with only a name. The score is a ranking aid that puts verified contacts first — it is not a guarantee of a reply.",
    text: "Score = published phone + email + website + source quality. A lead that publishes a phone, an email and a website from its own pages scores higher than one with only a name. The score is a ranking aid that puts verified contacts first — it is not a guarantee of a reply.",
  },
  {
    q: "Which cities are covered?",
    a: (
      <>
        Six cities are searchable in the live database today:{" "}
        {liveCities.map((c, i) => (
          <span key={c.slug}>
            {i > 0 && (i === liveCities.length - 1 ? " and " : ", ")}
            <Link href={`/leads/${c.slug}/dentists`} className="font-semibold text-accent-text underline underline-offset-2">
              {c.name} ({formatCount(c.dataset)}+ businesses)
            </Link>
          </span>
        ))}
        . Other cities are rolling out, one dataset at a time. You can still search any country or city — places outside the stored database fall back to slower live sources.
      </>
    ),
    text: `Six cities are searchable in the live database today: ${liveCities.map((c) => `${c.name} (${formatCount(c.dataset)}+ businesses)`).join(", ")}. Other cities are rolling out, one dataset at a time. You can still search any country or city — places outside the stored database fall back to slower live sources.`,
  },
  {
    q: "How much does it cost?",
    a: "Free accounts get 30 leads every day, no card needed. Pro adds effectively unlimited searches plus CSV, Excel, PDF and JSON export and AI outreach messages. See the pricing page for the full comparison.",
    text: "Free accounts get 30 leads every day, no card needed. Pro adds effectively unlimited searches plus CSV, Excel, PDF and JSON export and AI outreach messages. See the pricing page for the full comparison.",
  },
  {
    q: "Where does the data come from?",
    a: "Public business data only: Overture Maps, OpenStreetMap, and the public websites of the businesses themselves. LeadsForceGen never scrapes social media or Google, never sells personal phone numbers or personal emails, and never invents a contact.",
    text: "Public business data only: Overture Maps, OpenStreetMap, and the public websites of the businesses themselves. LeadsForceGen never scrapes social media or Google, never sells personal phone numbers or personal emails, and never invents a contact.",
  },
  {
    q: "Can I search any country or industry?",
    a: "Yes — the search form takes any industry in plain words and any country, city or neighbourhood. The six live cities above answer from the stored database; everywhere else the search uses live public sources, which can be slower or return fewer results.",
    text: "Yes — the search form takes any industry in plain words and any country, city or neighbourhood. The six live cities answer from the stored database; everywhere else the search uses live public sources, which can be slower or return fewer results.",
  },
  {
    q: "How do I export leads?",
    a: "Pro accounts can download results as CSV, Excel, PDF or JSON from the dashboard, up to 500 leads per search. Exports are a Pro feature — free accounts can search and view leads, but not download them.",
    text: "Pro accounts can download results as CSV, Excel, PDF or JSON from the dashboard, up to 500 leads per search. Exports are a Pro feature — free accounts can search and view leads, but not download them.",
  },
  {
    q: "How do I remove my business from the results?",
    a: (
      <>
        Use the <Link href="/unsubscribe" className="font-semibold text-accent-text underline underline-offset-2">remove a business</Link> page — your business is removed from all future results. Every outreach message also carries an opt-out line.
      </>
    ),
    text: "Use the remove a business page — your business is removed from all future results. Every outreach message also carries an opt-out line.",
  },
  {
    q: "Do I need a card for the free plan?",
    a: "No. The free plan needs only an account — 30 leads a day, AI lead scoring and search history, with no card and no trial expiry.",
    text: "No. The free plan needs only an account — 30 leads a day, AI lead scoring and search history, with no card and no trial expiry.",
  },
];

export default function FaqPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.text,
      },
    })),
  };
  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-8 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-accent-text">FAQ</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
        Frequently asked questions
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        How LeadsForceGen works, what each lead includes, and what Free and Pro cost. Still stuck?{" "}
        <Link href="/contact" className="font-semibold text-accent-text underline underline-offset-2">Contact us</Link>.
      </p>

      <div className="mt-8 border-t-2 border-fg">
        {faqs.map((f) => (
          <div key={f.q} className="border-b border-border py-5">
            <h2 className="font-display text-lg font-bold text-fg">{f.q}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{f.a}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/dashboard" className="btn-cta px-6">Search leads</Link>
        <Link href="/pricing" className="btn-primary px-6">See pricing</Link>
      </div>
    </div>
  );
}
