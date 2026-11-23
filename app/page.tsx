import Link from "next/link";
import Reveal from "@/components/Reveal";
import { MotionLink } from "@/components/motion/MotionLink";
import AdSense from "@/components/AdSense";
import SampleLeadTable from "@/components/SampleLeadTable";
import { getSampleLeads } from "@/lib/sampleLeads";
import { SEO_CITIES, formatCount } from "@/lib/seo-pages";

// Landing page v3 (2026-11-18) — the directory, not a SaaS template:
// the hero IS the product (a real, readable lead table fetched from
// the live database), the page reads like a sales ledger / atlas —
// ruled lines, a display serif for headlines, monospace for data,
// one accent used sparingly. No gradients, no glass, no generic
// hero + cards. Copy stays honest: no invented testimonials, ratings
// or logos; every business shown is real and source-stamped.

// Ledger entries: what every search returns, as numbered rows —
// not six identical cards.
const ledgerEntries = [
  { n: "01", title: "Any lead type", text: "Search by industry and city — dentists, restaurants, hotels, clinics, schools, agencies and hundreds more categories." },
  { n: "02", title: "Real business data", text: "Leads come from a stored database of real businesses and their own websites — names, phones, emails, socials. Never demo data." },
  { n: "03", title: "AI scoring", text: "Every prospect gets a fit score with verified contacts first, so you work the best leads before the rest." },
  { n: "04", title: "AI outreach", text: "Generate a personalized outreach message for any lead in one click — with the opt-out line built in." },
  { n: "05", title: "Excel & CSV export", text: "Export up to 500 leads per search on Pro, ready for your CRM or outreach tool." },
  { n: "06", title: "Private by design", text: "Your searches, leads and payments are visible only to you — enforced in the database itself, audited and verified." },
];

const stats = [
  ["1.1M+", "businesses in the database"],
  ["87%+", "of leads publish a phone"],
  ["500", "leads per Pro search"],
  ["30", "free leads every day"],
];

const steps = [
  ["01", "Search", "Pick an industry and a city — Dubai, Kathmandu, New York and more."],
  ["02", "Get real leads", "Real businesses with the contacts they publish, scored and source-linked."],
  ["03", "Reach out", "Export to Excel/CSV or generate AI outreach and start conversations."],
];

const liveCities = SEO_CITIES.filter((c) => c.live);

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-[3px] shrink-0 text-success" aria-hidden="true"><path d="m4.5 12.5 5 5 10-11" /></svg>
  );
}
function Cross() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="mt-[3px] shrink-0 text-muted" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
  );
}

function Eyebrow({ children }: { children: string }) {
  return <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-accent-text">{children}</p>;
}

export default async function Home() {
  const sampleTabs = await getSampleLeads();
  return (
    <div>
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-10 sm:pt-14">
        {/* Masthead — a directory front page, not a hero banner. */}
        <section aria-label="Introduction">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-fg pb-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            <span className="text-accent-text">LeadsForceGen — the business directory for sales</span>
            <span>1.1M+ businesses · Updated daily</span>
          </div>
          <h1 className="mx-auto mt-8 max-w-3xl text-center font-display text-5xl font-bold leading-[1.05] tracking-[-0.01em] text-fg sm:text-6xl">
            Real businesses. <span className="underline decoration-accent decoration-[3px] underline-offset-8">Published contacts.</span> One search.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-center text-base leading-relaxed text-muted sm:text-lg">
            Search real companies by industry and city, get the contacts they publish — phone, email, website, socials — scored by AI and ready to export. Free to start, unlimited* on Pro.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <MotionLink href="/signup" className="btn-cta">Start free — no card needed</MotionLink>
            <MotionLink href="#cities" className="btn-ghost">Browse covered cities</MotionLink>
          </div>
          <p className="mt-3 text-center font-mono text-xs text-muted">Free: 30 leads/day · Pro: unlimited* leads (fair use)</p>

          <SampleLeadTable tabs={sampleTabs} />

          <dl className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-y-7 border-t border-border pt-8 lg:grid-cols-4" aria-label="Platform numbers">
            {stats.map(([n, label]) => (
              <div key={label} className="flex flex-col px-2">
                <dd className="order-1 font-mono text-3xl font-bold tracking-tight text-fg">{n}</dd>
                <dt className="order-2 mt-1 text-xs font-medium text-muted">{label}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-center text-xs text-muted">Database counts measured October 2026.</p>

          <p className="mt-8 border-t border-border pt-5 text-center font-mono text-xs leading-relaxed text-muted">
            Built on public business data · Overture Maps · OpenStreetMap · each business&rsquo;s own website
          </p>
        </section>

        {/* Covered cities — the directory index. Live cities only. */}
        <div id="cities" className="mt-24 scroll-mt-24">
        <Reveal>
          <Eyebrow>Covered cities</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-fg">Searchable today, in the live database</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            These six cities are in the stored database right now — every search here answers from real rows.
            Other cities are rolling out, one dataset at a time.
          </p>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <caption className="sr-only">Cities covered by the live LeadsForceGen database</caption>
              <thead>
                <tr className="border-b-2 border-fg text-left font-mono text-xs uppercase tracking-[0.12em] text-muted">
                  <th scope="col" className="py-3 pr-4 font-semibold">City</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Businesses in dataset</th>
                  <th scope="col" className="py-3 font-semibold">Start here</th>
                </tr>
              </thead>
              <tbody>
                {liveCities.map((c) => (
                  <tr key={c.slug} className="border-b border-border">
                    <td className="py-3 pr-4 font-display text-base font-bold text-fg">{c.name}</td>
                    <td className="py-3 pr-4 font-mono text-[13px] text-fg">{formatCount(c.dataset)}+</td>
                    <td className="py-3">
                      <Link href={`/leads/${c.slug}/dentists`} className="font-semibold text-accent-text underline underline-offset-2">
                        Dentists in {c.name} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
        </div>

        {/* The ledger — what every search returns. */}
        <Reveal className="mt-24">
          <Eyebrow>The ledger</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-fg">What every search returns</h2>
          <div className="mt-8 border-t-2 border-fg">
            {ledgerEntries.map((f) => (
              <div key={f.n} className="grid gap-1 border-b border-border py-5 sm:grid-cols-[64px_220px_1fr] sm:gap-4 sm:py-4">
                <span className="font-mono text-sm font-bold text-accent-text" aria-hidden="true">{f.n}</span>
                <h3 className="font-display text-lg font-bold text-fg">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </Reveal>

        {/* How it works — a ruled strip, not three cards. */}
        <Reveal className="mt-24">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-fg">From search to conversation in minutes</h2>
          <ol className="mt-8 grid gap-6 border-t-2 border-fg pt-6 md:grid-cols-3 md:gap-8">
            {steps.map(([n, t, d]) => (
              <li key={t}>
                <span className="font-mono text-2xl font-bold text-accent-text" aria-hidden="true">{n}</span>
                <h3 className="mt-2 font-display text-lg font-bold text-fg">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm">
            <Link href="/how-it-works" className="font-semibold text-accent-text underline underline-offset-2">How it works in detail →</Link>
          </p>
        </Reveal>

        {/* Pricing block stays static on purpose: pricing-adjacent
            content is never animated. */}
        <div className="mt-24">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-fg">Start free. Upgrade when it pays.</h2>
          <div className="mx-auto mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
            <div className="card card-hover p-6" style={{ borderTop: "2px solid var(--fg)" }}>
              <h3 className="font-display text-xl font-bold text-fg">Free</h3>
              <p className="mt-2 font-mono text-4xl font-bold text-fg">$0</p>
              <ul className="mt-5 space-y-2.5 text-sm text-muted">
                <li className="flex gap-2"><Check />30 leads per day</li>
                <li className="flex gap-2"><Check />AI lead scoring</li>
                <li className="flex gap-2"><Check />Search history</li>
                <li className="flex gap-2"><Cross />No Excel/CSV export</li>
                <li className="flex gap-2"><Cross />Limited AI outreach</li>
              </ul>
              <Link href="/signup" className="btn-ghost btn-block mt-7">Start free</Link>
            </div>
            <div className="card card-hover relative p-6" style={{ borderColor: "var(--cta)", borderWidth: 2 }}>
              <h3 className="font-display text-xl font-bold text-fg">Pro</h3>
              <p className="mt-2 font-mono text-4xl font-bold text-fg">$19<span className="text-base font-medium text-muted">/mo</span></p>
              <ul className="mt-5 space-y-2.5 text-sm text-muted">
                <li className="flex gap-2"><Check />Unlimited* leads (fair use)</li>
                <li className="flex gap-2"><Check />Up to 500 leads per search</li>
                <li className="flex gap-2"><Check />Excel & CSV export</li>
                <li className="flex gap-2"><Check />Full AI outreach generator</li>
                <li className="flex gap-2"><Check />Secure worldwide checkout</li>
              </ul>
              <Link href="/checkout" className="btn-cta btn-block mt-7">Upgrade to Pro</Link>
            </div>
          </div>
          <p className="mt-4 text-center text-sm">
            <Link href="/pricing" className="font-semibold text-accent-text underline underline-offset-2">Compare plans in full →</Link>
          </p>
        </div>

        {/* Closing panel — flat accent, theme tokens only. */}
        <Reveal className="mt-24">
          <div className="rounded-3xl px-6 py-12 text-center shadow-[var(--shadow-lg)]" style={{ background: "var(--accent)" }}>
            <h2 className="font-display text-3xl font-bold tracking-tight text-accent-fg">Your next customer is already in the database.</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-accent-fg opacity-90">Join free, run your first search in under a minute, and see real businesses — not samples.</p>
            <MotionLink href="/signup" className="btn-cta mt-7">Start free</MotionLink>
          </div>
        </Reveal>

        <p className="mx-auto mt-12 max-w-2xl text-center text-xs leading-relaxed text-muted">
          Leads are company-level prospects from public business data. Every lead shows its source so you can verify it before outreach. LeadsForceGen never sells personal phone numbers or personal emails, and never scrapes social media or Google.
        </p>

        <Reveal className="card mx-auto mt-12 max-w-2xl p-6 text-center" >
          <h2 className="font-display text-xl font-bold text-fg">LeadsForceGen on Android</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The Android app is this website in an app: the same lead search, the same login, the same data. Download the APK, allow install from unknown sources once on your phone, then sign in with your usual account.
          </p>
          <MotionLink href="https://github.com/lunnar211/android-apps/releases/latest/download/leadsforcegen-debug.apk" className="btn-cta mt-5">Download for Android (.apk)</MotionLink>
          <p className="mt-3 text-sm">
            <Link href="https://github.com/lunnar211/android-apps/releases" className="underline">All Android apps on GitHub</Link>
          </p>
        </Reveal>

        {/* AdSense: renders nothing until NEXT_PUBLIC_ADSENSE_PUBLISHER_ID is set (see components/AdSense.tsx). */}
        <AdSense />
      </div>
    </div>
  );
}
