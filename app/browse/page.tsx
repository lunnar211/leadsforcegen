import type { Metadata } from "next";
import Link from "next/link";
import { SEO_CITIES, SEO_NICHES, formatCount, seoPages } from "@/lib/seo-pages";

// Browse page: every city x niche combination that has its own SEO page,
// grouped by city. All data comes from lib/seo-pages — the same source the
// sitemap and the /leads/[city]/[niche] pages use. No counts invented here:
// live cities show all 8 niches, rolling-out cities show the first 4,
// exactly like seoPages() does.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://leadsforcegen.vercel.app";

const combos = seoPages();
const liveCities = SEO_CITIES.filter((c) => c.live);

export const metadata: Metadata = {
  title: "Browse Business Leads by City and Niche | LeadsForceGen",
  description: `Browse ${combos.length} city and niche combinations — ${liveCities.length} cities searchable in the live database today, more cities rolling out. Every combination has its own page with real businesses from public listings.`,
  alternates: { canonical: `${SITE_URL}/browse` },
};

function nichesForCity(citySlug: string) {
  const city = SEO_CITIES.find((c) => c.slug === citySlug);
  return city && city.live ? SEO_NICHES : SEO_NICHES.slice(0, 4);
}

export default function BrowsePage() {
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Browse business leads by city and niche",
    itemListElement: combos.map(({ city, niche }, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${niche.plural} in ${city.name}`,
      url: `${SITE_URL}/leads/${city.slug}/${niche.slug}`,
    })),
  };
  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-8 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-accent-text">Browse leads</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
        Every city, every niche
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        {combos.length} combinations, each with its own page. The {liveCities.length} cities marked
        live are searchable in the stored database today — every search there answers from real rows.
        The other cities&rsquo; datasets cover the metro area and are rolling out to live search; their
        pages say so, and never claim live results that don&rsquo;t exist yet.
      </p>
      <p className="mt-3 text-base leading-relaxed text-muted">
        Pick a city below, then a niche. To search a lead type of your own,{" "}
        <Link href="/signup" className="font-semibold text-accent-text underline underline-offset-2">
          create a free account
        </Link>{" "}
        — 30 leads a day, no card needed.
      </p>

      {/* Jump-to-city index — plain anchors, no JS. */}
      <nav aria-label="Cities" className="mt-8 border-y border-border py-4">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted">Jump to a city</p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {SEO_CITIES.map((c) => (
            <li key={c.slug}>
              <a href={`#${c.slug}`} className="text-sm font-semibold text-accent-text underline underline-offset-2">
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8">
        {SEO_CITIES.map((city) => (
          <section key={city.slug} id={city.slug} className="scroll-mt-24 border-b border-border py-6">
            <h2 className="font-display text-xl font-bold text-fg">
              {city.name}
              <span className="ml-3 align-middle font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                {formatCount(city.dataset)}+ businesses in dataset
              </span>
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {city.live
                ? "Live — searchable in the database today."
                : "Rolling out — the dataset covers the metro area and is coming to live search."}
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {nichesForCity(city.slug).map((niche) => (
                <li key={niche.slug}>
                  <Link
                    href={`/leads/${city.slug}/${niche.slug}`}
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg transition-colors hover:border-fg"
                  >
                    {niche.plural} in {city.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/signup" className="btn-cta px-6">Start free</Link>
        <Link href="/pricing" className="btn-primary px-6">See pricing</Link>
      </div>
    </div>
  );
}
