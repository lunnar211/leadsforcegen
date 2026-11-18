import "server-only";
import { cacheLife } from "next/cache";
import { queryPlaces, type PlaceRow } from "@/lib/engine/placesDb";

// Guest-visible product proof (homepage sample table).
//
// Real rows from the stored `places` table, fetched server-side at
// build/revalidation time through the existing service-role path — the
// service key never reaches the client, and guests can never run a live
// search from this data (it is a fixed, labelled sample, not a query
// endpoint). Cached for a day (`use cache` + `cacheLife("days")`,
// the Cache Components pattern for this Next.js 16.4 app).
//
// When the database is unreachable (no env vars at local build time,
// outage, empty result) the function fails open to the three rows
// verified against the live database on 2026-10-23, labelled as such —
// never invented rows. The Kathmandu tab is omitted entirely when its
// query returns nothing, rather than shown with made-up data.

export type SampleLeadRow = {
  name: string;
  meta: string;
  contact: string;
  contactKind: "phone" | "email" | "website";
  website: string;
  score: number;
  source: string;
};

export type SampleTab = {
  id: string;
  label: string;
  live: boolean;
  rows: SampleLeadRow[];
};

function domainOf(url: string): string {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .toLowerCase();
}

function prettyCategory(category: string | null): string {
  if (!category) return "Business";
  return category
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Score from stored fields only, using the same components the search
// engine uses (lib/engine/search.ts): published phone, email, website,
// domain match, socials, and listing-source confidence. Live checks
// the engine also applies (website reachability, distance, hours) are
// not available from stored rows, so a sample score can sit slightly
// below the same lead's live-search score — the dashboard explainer
// ("Score = published phone + email + website + source quality") is
// exactly what is computed here.
function scoreFromStored(p: PlaceRow): number {
  let score = 10; // real business name from a public source
  if (p.address) score += 20;
  if (p.phone) score += 20;
  if (p.website) score += 15;
  if (p.email) score += 15;
  if (p.email && p.website && p.email.toLowerCase().endsWith(`@${domainOf(p.website)}`)) score += 5;
  if (p.socials?.length) score += 5;
  if (p.confidence) score += Math.round(p.confidence * 5);
  if (p.phone || p.email) score += 10;
  return Math.min(100, score);
}

function toRow(p: PlaceRow, city: string): SampleLeadRow {
  const website = p.website
    ? p.website.startsWith("http")
      ? p.website
      : `https://${p.website}`
    : "";
  const contact = p.phone
    ? { text: p.phone, kind: "phone" as const }
    : p.email
      ? { text: p.email, kind: "email" as const }
      : { text: website ? domainOf(website) : p.name, kind: "website" as const };
  return {
    name: p.name,
    meta: `${prettyCategory(p.category)} · ${p.locality || city}`,
    contact: contact.text,
    contactKind: contact.kind,
    website,
    score: scoreFromStored(p),
    source: website ? "business website · Overture Maps" : "Overture Maps",
  };
}

// Rows verified against the live database on 2026-10-23 (previously the
// homepage mock). Shown only when the live query returns nothing.
const FALLBACK_DUBAI_DENTISTS: SampleLeadRow[] = [
  {
    name: "Dr. Michael's Dental Clinic",
    meta: "Dental Clinic · Dubai",
    contact: "+971 4 330 0441",
    contactKind: "phone",
    website: "",
    score: 94,
    source: "Overture Maps",
  },
  {
    name: "Same Day Dental Implants",
    meta: "Dental Clinic · Dubai",
    contact: "info@samedayme.com",
    contactKind: "email",
    website: "",
    score: 91,
    source: "business website · Overture Maps",
  },
  {
    name: "Oris Dental Centre",
    meta: "Dental Clinic · Dubai",
    contact: "orisdentalcentre.com",
    contactKind: "website",
    website: "https://orisdentalcentre.com",
    score: 88,
    source: "business website · Overture Maps",
  },
];

export async function getSampleLeads(): Promise<SampleTab[]> {
  "use cache";
  cacheLife("days");

  const tabs: SampleTab[] = [];
  try {
    const [dubai, kathmandu] = await Promise.all([
      queryPlaces("dentist", ["dentist"], 25.2048, 55.2708, 20, 6).catch(() => []),
      queryPlaces("restaurant", ["restaurant"], 27.7172, 85.324, 20, 6).catch(() => []),
    ]);
    const dubaiRows = dubai
      .map((p) => toRow(p, "Dubai"))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    if (dubaiRows.length > 0) {
      tabs.push({ id: "dubai-dentists", label: "Dentists · Dubai", live: true, rows: dubaiRows });
    }
    const kathmanduRows = kathmandu
      .map((p) => toRow(p, "Kathmandu"))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    if (kathmanduRows.length > 0) {
      tabs.push({ id: "kathmandu-restaurants", label: "Restaurants · Kathmandu", live: true, rows: kathmanduRows });
    }
  } catch {
    // Fail open to the verified fallback below.
  }
  if (tabs.length === 0) {
    tabs.push({ id: "dubai-dentists", label: "Dentists · Dubai", live: false, rows: FALLBACK_DUBAI_DENTISTS });
  }
  return tabs;
}
