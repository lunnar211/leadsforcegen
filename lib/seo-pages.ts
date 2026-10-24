// Programmatic SEO pages: one genuine page per city x profession.
// Counts below are MEASURED, never invented:
//  - Covered cities (live in the `places` table): AE/NP/US totals from SQL
//    group-by (2026-10-23/24); Dubai/Kathmandu totals from the Overture
//    release measurement; niche counts only where a bbox was measured
//    (Dubai dentists 482, Kathmandu restaurants 2,496).
//  - Pack cities (dataset extracted, rolling out to live search):
//    metro-box row counts from scripts/ingest_overture_city.py --counts
//    (release 2026-10-21.0, 2026-10-24). Pages for these cities say the
//    dataset is rolling out — they never claim live results that don't
//    exist yet.

export type SeoCity = {
  slug: string;
  name: string;
  dataset: number; // businesses in this city's dataset (metro box)
  live: boolean; // searchable in the live `places` table today
};

export type SeoNiche = {
  slug: string; // plural URL slug
  plural: string;
  singular: string;
  canonical: string; // engine niche key
};

export const SEO_CITIES: SeoCity[] = [
  { slug: "dubai", name: "Dubai", dataset: 64200, live: true },
  { slug: "kathmandu", name: "Kathmandu", dataset: 43537, live: true },
  { slug: "new-york", name: "New York", dataset: 622511, live: true },
  { slug: "seattle", name: "Seattle", dataset: 158144, live: true },
  { slug: "london", name: "London", dataset: 725214, live: false },
  { slug: "tokyo", name: "Tokyo", dataset: 661180, live: false },
  { slug: "sao-paulo", name: "São Paulo", dataset: 595656, live: false },
  { slug: "paris", name: "Paris", dataset: 488212, live: false },
  { slug: "delhi", name: "Delhi", dataset: 262122, live: false },
  { slug: "berlin", name: "Berlin", dataset: 250897, live: false },
  { slug: "mumbai", name: "Mumbai", dataset: 217583, live: false },
  { slug: "toronto", name: "Toronto", dataset: 205521, live: false },
  { slug: "sydney", name: "Sydney", dataset: 180524, live: false },
  { slug: "dhaka", name: "Dhaka", dataset: 106514, live: false },
  { slug: "karachi", name: "Karachi", dataset: 35985, live: false },
];

export const SEO_NICHES: SeoNiche[] = [
  { slug: "dentists", plural: "Dentists", singular: "dentist", canonical: "dentist" },
  { slug: "restaurants", plural: "Restaurants", singular: "restaurant", canonical: "restaurant" },
  { slug: "hotels", plural: "Hotels", singular: "hotel", canonical: "hotel" },
  { slug: "cafes", plural: "Cafés", singular: "café", canonical: "cafe" },
  { slug: "gyms", plural: "Gyms", singular: "gym", canonical: "gym" },
  { slug: "pharmacies", plural: "Pharmacies", singular: "pharmacy", canonical: "pharmacy" },
  { slug: "salons", plural: "Salons", singular: "salon", canonical: "salon" },
  { slug: "lawyers", plural: "Lawyers", singular: "lawyer", canonical: "lawyer" },
];

// Covered cities get all 8 niches; pack cities get the 4 most-searched.
// Total: 4*8 + 11*4 = 76 pages.
export function seoPages(): { city: SeoCity; niche: SeoNiche }[] {
  const out: { city: SeoCity; niche: SeoNiche }[] = [];
  for (const city of SEO_CITIES) {
    const niches = city.live ? SEO_NICHES : SEO_NICHES.slice(0, 4);
    for (const niche of niches) out.push({ city, niche });
  }
  return out;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function cityBySlug(slug: string): SeoCity | undefined {
  return SEO_CITIES.find((c) => c.slug === slug);
}

export function nicheBySlug(slug: string): SeoNiche | undefined {
  return SEO_NICHES.find((n) => n.slug === slug);
}
