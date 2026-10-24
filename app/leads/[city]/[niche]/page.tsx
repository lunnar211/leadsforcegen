import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  SEO_CITIES,
  SEO_NICHES,
  cityBySlug,
  nicheBySlug,
  formatCount,
  seoPages,
} from "@/lib/seo-pages";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://leadsforcegen.vercel.app";

export function generateStaticParams() {
  return seoPages().map(({ city, niche }) => ({ city: city.slug, niche: niche.slug }));
}

type Params = { city: string; niche: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { city: citySlug, niche: nicheSlug } = await params;
  const city = cityBySlug(citySlug);
  const niche = nicheBySlug(nicheSlug);
  if (!city || !niche) return {};
  const title = `${niche.plural} in ${city.name} | Verified Business Leads — LeadsForceGen`;
  const description = `Find verified ${niche.plural.toLowerCase()} in ${city.name} with phone, email, website and social links. Real businesses from public listings. Free: 30 leads a day.`;
  const url = `${SITE_URL}/leads/${city.slug}/${niche.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "LeadsForceGen" },
    twitter: { card: "summary", title, description },
  };
}

export default async function SeoLeadPage({ params }: { params: Promise<Params> }) {
  const { city: citySlug, niche: nicheSlug } = await params;
  const city = cityBySlug(citySlug);
  const niche = nicheBySlug(nicheSlug);
  if (!city || !niche) notFound();

  const url = `${SITE_URL}/leads/${city.slug}/${niche.slug}`;
  const siblings = SEO_NICHES.filter((n) => n.slug !== niche.slug).slice(0, 4);
  const otherCities = SEO_CITIES.filter((c) => c.slug !== city.slug).slice(0, 4);
  // Niche counts only where a bbox was actually measured — never invented.
  const nicheCount =
    city.slug === "dubai" && niche.slug === "dentists"
      ? "480+"
      : city.slug === "kathmandu" && niche.slug === "restaurants"
        ? "2,400+"
        : null;

  const faqs = [
    {
      q: `How many ${niche.plural.toLowerCase()} are listed in ${city.name}?`,
      a: city.live
        ? `Our ${city.name} dataset holds ${formatCount(city.dataset)}+ businesses, including ${niche.plural.toLowerCase()} across the city${nicheCount ? ` (${nicheCount} measured in our coverage check)` : ""}. Search filters the dataset to exactly the profession you want.`
        : `Our ${city.name} dataset covers ${formatCount(city.dataset)} businesses across the metro area and is rolling out to live search. The search below filters it to ${niche.plural.toLowerCase()} as coverage lands.`,
    },
    {
      q: `What contact details do I get for each ${niche.singular}?`,
      a: `Every lead carries what the business itself publishes: phone, email, website, social profiles, address and opening hours where available — plus a quality score and the listing source, so you can verify before outreach.`,
    },
    {
      q: `Are these ${niche.plural.toLowerCase()} verified?`,
      a: `Leads come from licensed public business listings (Overture Maps) and the businesses' own websites — never guessed or invented. Email domains are checked for valid mail records, and every lead shows its source. We still recommend a quick verification before outreach.`,
    },
    {
      q: `How much does it cost to get ${niche.plural.toLowerCase()} in ${city.name}?`,
      a: `Free accounts get 30 leads every day, no card needed. Pro adds effectively unlimited searches plus CSV, Excel, PDF and JSON export and AI outreach messages.`,
    },
  ];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Leads", item: `${SITE_URL}/leads` },
      { "@type": "ListItem", position: 3, name: city.name, item: `${SITE_URL}/leads/${city.slug}` },
      { "@type": "ListItem", position: 4, name: niche.plural, item: url },
    ],
  };

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-8 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/" className="underline">Home</Link>
        {" / "}
        <Link href="/dashboard" className="underline">Leads</Link>
        {" / "}
        <span>{city.name}</span>
        {" / "}
        <span className="text-fg">{niche.plural}</span>
      </nav>

      <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
        {niche.plural} in {city.name} — Verified Business Leads
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        {city.live ? (
          <>
            Search {niche.plural.toLowerCase()} in {city.name} from our live database of{" "}
            {formatCount(city.dataset)}+ businesses{nicheCount ? `, including ${nicheCount} ${niche.plural.toLowerCase()}` : ""}.
            Every lead shows phone, email, website and social links the business itself publishes — scored and ready to verify.
          </>
        ) : (
          <>
            Our {city.name} dataset covers {formatCount(city.dataset)} businesses across the metro area and is rolling out
            to live search, city by city. The search below will return {niche.plural.toLowerCase()} here as soon as this
            city&apos;s data goes live — every lead with phone, email, website and social links.
          </>
        )}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-2xl font-extrabold text-fg">{formatCount(city.dataset)}+</p>
          <p className="mt-1 text-sm text-muted">Businesses in our {city.name} dataset</p>
        </div>
        <div className="card p-5">
          <p className="text-2xl font-extrabold text-fg">Phone · Email · Web</p>
          <p className="mt-1 text-sm text-muted">Plus socials, address and hours where published</p>
        </div>
        <div className="card p-5">
          <p className="text-2xl font-extrabold text-fg">100% public sources</p>
          <p className="mt-1 text-sm text-muted">Licensed listings + businesses&apos; own websites — never invented</p>
        </div>
      </div>

      <h2 className="mt-8 text-2xl font-bold tracking-tight text-fg">What each lead includes</h2>
      <ul className="mt-3 space-y-2 text-sm text-fg">
        <li>✓ Business name, category and address in {city.name}</li>
        <li>✓ Phone and email the business publishes, with the email domain mail-checked</li>
        <li>✓ Website and social profiles (Facebook, Instagram, LinkedIn, YouTube, TikTok, X)</li>
        <li>✓ A quality score and the listing source, so you can verify before outreach</li>
        <li>✓ One-click export to CSV, Excel, PDF or JSON (Pro)</li>
      </ul>

      <h2 className="mt-8 text-2xl font-bold tracking-tight text-fg">How it works</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-fg">
        <li>Search {niche.plural.toLowerCase()} in {city.name} — type the profession in plain words, any wording works.</li>
        <li>Review scored leads with their published contacts and sources.</li>
        <li>Export the list or generate an AI outreach message (with an opt-out line) for each lead.</li>
      </ol>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/dashboard" className="btn-cta px-6">
          Search {niche.plural} in {city.name}
        </Link>
        <Link href="/signup" className="btn-primary px-6">
          Create free account
        </Link>
      </div>
      <p className="mt-3 text-xs text-muted">Free plan: 30 leads a day, no card needed. Pro: effectively unlimited searches + exports.</p>

      <h2 className="mt-10 text-2xl font-bold tracking-tight text-fg">Frequently asked questions</h2>
      <div className="mt-4 space-y-4">
        {faqs.map((f) => (
          <div key={f.q} className="card p-5">
            <h3 className="font-semibold text-fg">{f.q}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{f.a}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-xl font-bold tracking-tight text-fg">More {niche.plural.toLowerCase()} and cities</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {siblings.map((n) => (
          <Link key={n.slug} href={`/leads/${city.slug}/${n.slug}`} className="btn-ghost text-sm">
            {n.plural} in {city.name}
          </Link>
        ))}
        {otherCities.map((c) => (
          <Link key={c.slug} href={`/leads/${c.slug}/${niche.slug}`} className="btn-ghost text-sm">
            {niche.plural} in {c.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
