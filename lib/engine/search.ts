import "server-only";
import { safeFetch } from "@/lib/safe-fetch";
import type { Lead } from "@/lib/types";

// Search Everywhere — phase 1 (public sources only, per policy):
//   1. Geocode the location with Nominatim (proper User-Agent, A5 rules).
//   2. Find real businesses around it with Overpass (3 mirrors, fallback).
//   3. For businesses with a website, read the homepage + /contact through
//      safe-fetch (robots + SSRF + blocklist enforced) and extract the
//      business contacts THEY publish. Contacts are never invented.
// Every lead carries provenance (sourceUrl). Any failure returns [] so the
// caller falls back to the next source — this function never throws.

const UA = "LeadForge/1.0 (leadsforcegen.vercel.app)";
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

type OsmElement = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function nicheTerms(niche: string): string[] {
  const base = niche.toLowerCase().trim();
  const singular = base.replace(/s$/, "");
  const terms = new Set<string>([base, singular]);
  const synonyms: Record<string, string[]> = {
    dentist: ["dentist", "dental"],
    dentists: ["dentist", "dental"],
    restaurant: ["restaurant", "cafe", "food"],
    hotel: ["hotel", "guest_house", "hostel"],
    plumber: ["plumber", "plumbing"],
    electrician: ["electrician", "electrical"],
    salon: ["hairdresser", "beauty", "salon"],
    gym: ["fitness", "gym", "sports_centre"],
    pharmacy: ["pharmacy", "chemist"],
    clinic: ["clinic", "doctors", "hospital"],
    lawyer: ["lawyer", "attorney", "legal"],
    cafe: ["cafe", "coffee"],
  };
  for (const s of synonyms[base] || synonyms[singular] || []) terms.add(s);
  return [...terms].filter(Boolean);
}

async function geocode(location: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(location)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data.length) return null;
  return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
}

async function overpass(lat: number, lon: number, terms: string[]): Promise<OsmElement[]> {
  const regex = terms.join("|").replace(/[^a-z0-9| ]/g, "");
  const ql = `[out:json][timeout:25];(nwr["name"~"${regex}",i](around:25000,${lat},${lon});nwr[~"^(amenity|shop|office|tourism|leisure|healthcare)$"~"${regex}",i](around:25000,${lat},${lon}););out center 200;`;
  const mirrors = process.env.OVERPASS_URL
    ? process.env.OVERPASS_URL.split(",").map((s) => s.trim()).filter(Boolean)
    : OVERPASS_MIRRORS;
  for (const mirror of mirrors) {
    try {
      // Overpass's canonical interface is POST with a form body.
      const res = await fetch(mirror, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ data: ql }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { elements?: OsmElement[] };
      if (data.elements) return data.elements;
    } catch { /* try next mirror */ }
  }
  return [];
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function extractContacts(html: string, domain: string): { email?: string; phone?: string } {
  const out: { email?: string; phone?: string } = {};
  const mailtos = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => decodeURIComponent(m[1]).toLowerCase());
  const plain = (html.match(EMAIL_RE) || []).map((e) => e.toLowerCase());
  const decoded = html
    .replace(/\[at\]/gi, "@")
    .replace(/\(at\)/gi, "@")
    .replace(/\[dot\]/gi, ".")
    .replace(/\(dot\)/gi, ".");
  const decodedEmails = (decoded.match(EMAIL_RE) || []).map((e) => e.toLowerCase());
  const all = [...new Set([...mailtos, ...plain, ...decodedEmails])].filter(
    (e) => !e.endsWith(".png") && !e.endsWith(".jpg") && !e.includes("example.") && !e.includes("sentry"),
  );
  if (all.length) {
    out.email =
      all.find((e) => e.endsWith(`@${domain}`)) ||
      all.find((e) => /^(info|contact|hello|sales|office|enquiries|bookings)@/.test(e)) ||
      all[0];
  }
  const tel = html.match(/tel:(\+?[0-9\s()-]{7,20})/i);
  if (tel) out.phone = tel[1].trim();
  return out;
}

function domainOf(website: string): string {
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export type EngineResult = { leads: Lead[]; pagesRead: number; placesFound: number };

export async function searchEverywhere(niche: string, location: string, limit: number): Promise<EngineResult> {
  const empty: EngineResult = { leads: [], pagesRead: 0, placesFound: 0 };
  try {
    if (!niche || !location) return empty;
    const geo = await geocode(location);
    if (!geo) return empty;
    const elements = await overpass(geo.lat, geo.lon, nicheTerms(niche));
    const terms = nicheTerms(niche);

    type Candidate = { el: OsmElement; name: string; website?: string; phone?: string; email?: string; address?: string; hours?: string };
    const candidates: Candidate[] = [];
    const seenDomains = new Set<string>();
    for (const el of elements) {
      const t = el.tags || {};
      const name = t.name;
      if (!name) continue;
      const tagValues = [t.amenity, t.shop, t.office, t.tourism, t.leisure, t.healthcare, t.craft]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matches = terms.some(
        (term) => tagValues.includes(term) || name.toLowerCase().includes(term),
      );
      if (!matches) continue;
      const website = t["contact:website"] || t.website;
      const domain = website ? domainOf(website) : "";
      if (domain && seenDomains.has(domain)) continue;
      if (domain) seenDomains.add(domain);
      const address = [t["addr:street"], t["addr:city"], t["addr:country"]]
        .filter(Boolean)
        .join(", ");
      candidates.push({
        el,
        name,
        website,
        phone: t["contact:phone"] || t.phone,
        email: t["contact:email"] || t.email,
        address: address || undefined,
        hours: t.opening_hours,
      });
      if (candidates.length >= Math.max(limit * 2, 20)) break;
    }

    let pagesRead = 0;
    const leads: Lead[] = [];
    for (const c of candidates) {
      let email = c.email;
      let phone = c.phone;
      let websiteAlive = false;
      if (c.website && pagesRead < 24) {
        const domain = domainOf(c.website);
        const base = c.website.startsWith("http") ? c.website : `https://${c.website}`;
        for (const path of [base, `${base.replace(/\/$/, "")}/contact`]) {
          try {
            const page = await safeFetch(path);
            if (page.status >= 200 && page.status < 400) {
              websiteAlive = true;
              pagesRead += 1;
              const found = extractContacts(page.text, domain);
              email = email || found.email;
              phone = phone || found.phone;
            }
          } catch { /* robots/blocked/dead — skip quietly */ }
          if (email && phone) break;
        }
      }
      // Confidence (subset of the spec formula, honestly applied):
      let score = 10; // real business name from a public source
      if (c.address) score += 20;
      if (phone) score += 20;
      if (c.website && websiteAlive) score += 15;
      if (email) score += 15;
      if (email && c.website && email.endsWith(`@${domainOf(c.website)}`)) score += 5;
      if (c.hours) score += 5;
      if (c.phone || c.email) score += 10; // source-provided contact
      score = Math.min(100, score);

      leads.push({
        company: c.name,
        industry: niche,
        location: c.address || location,
        size: "",
        website: c.website ? domainOf(c.website) : "",
        description: `Real business found on OpenStreetMap${c.website ? " with a live website" : ""}. Contacts are published by the business itself — verify before outreach.`,
        score,
        email,
        phone,
        address: c.address,
        sourceUrl: `https://www.openstreetmap.org/${c.el.type}/${c.el.id}`,
        sourceName: "OpenStreetMap",
      });
      if (leads.length >= limit) break;
    }
    leads.sort((a, b) => b.score - a.score);
    return { leads, pagesRead, placesFound: candidates.length };
  } catch {
    return empty;
  }
}
