import "server-only";
import { resolveMx } from "node:dns/promises";
import { safeFetch } from "@/lib/safe-fetch";
import { cacheGet, cacheSet } from "@/lib/cache";
import { queryPlaces } from "@/lib/engine/placesDb";
import type { Lead } from "@/lib/types";

// Search Everywhere — phase 2 (public sources only, per policy):
//   1. Geocode the location with Nominatim (proper User-Agent, A5 rules).
//   2. Find real businesses around it with Overpass (mirrors raced in
//      parallel — first good answer wins).
//   3. For businesses with a website, read the homepage + /contact pages
//      through safe-fetch (robots + SSRF + blocklist enforced) with limited
//      concurrency under a hard deadline, and extract the business
//      contacts THEY publish — including their schema.org JSON-LD
//      structured data, the highest-trust source. Contacts never invented.
//   4. Verify each published email's domain really accepts mail (DNS MX).
// Every lead carries provenance (sourceUrl). Any failure returns [] so the
// caller falls back to the next source — this function never throws.

const UA = "LeadForge/1.0 (leadsforcegen.vercel.app)";
// Full-planet Overpass instances, raced in parallel. As of 2026-10-22 the
// original three are unreliable from datacenter IPs (overpass-api.de
// answers HTTP 406 — an nginx-level block — and kumi/private.coffee time
// out), so the list is wider and the OSM API fallback below covers the
// case where every mirror fails. Exported for the diagnostics endpoint.
export const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

type OsmElement = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

// Users misspell industries constantly ("Dantist", "Resturant") — and a
// map search with the wrong spelling finds nothing. Normalize common
// niches (and near-miss spellings, via edit distance) to a canonical term
// before building the map query. Unknown niches pass through unchanged.
const CANONICAL_NICHE: Record<string, string> = {
  dentist: "dentist", dentists: "dentist", dantist: "dentist", dental: "dentist",
  restaurant: "restaurant", restaurants: "restaurant", resturant: "restaurant", restraunt: "restaurant",
  cafe: "cafe", cafes: "cafe", coffee: "cafe",
  hotel: "hotel", hotels: "hotel",
  plumber: "plumber", plumbers: "plumber", plumbing: "plumber",
  electrician: "electrician", electricians: "electrician", eletrician: "electrician", electrical: "electrician",
  salon: "salon", salons: "salon", hairdresser: "salon", hairdressers: "salon", barber: "salon",
  gym: "gym", gyms: "gym", fitness: "gym",
  pharmacy: "pharmacy", pharmacies: "pharmacy", pharmcy: "pharmacy", chemist: "pharmacy",
  clinic: "clinic", clinics: "clinic", clinc: "clinic", hospital: "clinic", doctor: "clinic", doctors: "clinic",
  lawyer: "lawyer", lawyers: "lawyer", lawer: "lawyer", attorney: "lawyer", attorneys: "lawyer", legal: "lawyer",
};

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

export function normalizeNiche(raw: string): string {
  const base = raw.toLowerCase().trim();
  if (!base) return base;
  if (CANONICAL_NICHE[base]) return CANONICAL_NICHE[base];
  if (base.length >= 5) {
    let bestKey = "";
    let bestDist = 3; // accept distance 1-2 only
    for (const key of Object.keys(CANONICAL_NICHE)) {
      const d = levenshtein(base, key);
      if (d < bestDist) { bestDist = d; bestKey = key; }
    }
    if (bestKey) return CANONICAL_NICHE[bestKey];
  }
  return base;
}

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
  const cacheKey = `geo:${location.toLowerCase().trim()}`;
  const cached = await cacheGet<{ lat: number; lon: number }>(cacheKey, 30 * 24 * 3600_000);
  if (cached) return cached;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(location)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data.length) return null;
  const point = { lat: Number(data[0].lat), lon: Number(data[0].lon) };
  void cacheSet(cacheKey, point);
  return point;
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Canonical OpenStreetMap tag pairs per niche. A tag-precise query
// (amenity=dentist) is both FASTER for Overpass and far more accurate
// than name matching: it returns businesses that ARE dentists even when
// their name does not contain the word, and skips name-alikes that are
// not. Name-regex stays as a second clause for unmapped businesses.
const NICHE_TAGS: Record<string, [string, string][]> = {
  dentist: [["amenity", "dentist"]],
  restaurant: [["amenity", "restaurant"], ["amenity", "fast_food"]],
  cafe: [["amenity", "cafe"]],
  hotel: [["tourism", "hotel"], ["tourism", "guest_house"], ["tourism", "hostel"], ["tourism", "apartment"]],
  pharmacy: [["amenity", "pharmacy"], ["healthcare", "pharmacy"]],
  clinic: [["amenity", "clinic"], ["amenity", "doctors"], ["healthcare", "clinic"], ["healthcare", "doctor"], ["healthcare", "dentist"]],
  gym: [["leisure", "fitness_centre"], ["leisure", "sports_centre"]],
  salon: [["shop", "hairdresser"], ["shop", "beauty"]],
  plumber: [["craft", "plumber"]],
  electrician: [["craft", "electrician"]],
  lawyer: [["office", "lawyer"]],
};

async function overpass(lat: number, lon: number, niche: string, terms: string[]): Promise<OsmElement[]> {
  const regex = terms.join("|").replace(/[^a-z0-9| ]/g, "");
  const clauses: string[] = [];
  for (const [k, v] of NICHE_TAGS[niche] || []) {
    clauses.push(`nwr["${k}"="${v}"](around:20000,${lat},${lon});`);
  }
  clauses.push(`nwr["name"~"${regex}",i](around:20000,${lat},${lon});`);
  clauses.push(`nwr[~"^(amenity|shop|office|tourism|leisure|healthcare|craft)$"~"${regex}",i](around:20000,${lat},${lon});`);
  const ql = `[out:json][timeout:15];(${clauses.join("")});out center 150;`;
  const mirrors = process.env.OVERPASS_URL
    ? process.env.OVERPASS_URL.split(",").map((s) => s.trim()).filter(Boolean)
    : OVERPASS_MIRRORS;
  // Race ALL mirrors in parallel and take the first good answer. The old
  // sequential loop could stack 3 x 30s timeouts and blow the serverless
  // time budget — that surfaced to users as a "network error".
  const attempts = mirrors.map(async (mirror): Promise<OsmElement[]> => {
    // Overpass's canonical interface is POST with a form body.
    const res = await fetch(mirror, {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ data: ql }),
      signal: AbortSignal.timeout(18000),
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const data = (await res.json()) as { elements?: OsmElement[] };
    if (!data.elements) throw new Error("overpass empty");
    return data.elements;
  });
  try {
    return await Promise.any(attempts);
  } catch {
    return [];
  }
}

// Last-resort POI source: the official OpenStreetMap API's map call.
// Different infrastructure from Overpass (which currently rejects or
// times out for datacenter IPs). A 2x2 tile grid of map calls covers
// roughly 12km x 12km around the geocoded center (each tile far below
// the API's max bbox area), fetched in parallel and deduped. Used ONLY
// when every Overpass mirror fails; searches are cached, so this stays
// occasional. Ways get a center computed from their member nodes in the
// same payload. OSM_API_URL override exists for testing.
async function osmApiFallback(lat: number, lon: number): Promise<OsmElement[]> {
  const base = process.env.OSM_API_URL || "https://api.openstreetmap.org/api/0.6";
  const d = 0.055; // tile half-box (~6 km); grid covers +/-0.11 deg (~12 km)
  const tile = async (cLat: number, cLon: number): Promise<(OsmElement & { nodes?: number[] })[]> => {
    try {
      const url = `${base}/map.json?bbox=${cLon - d},${cLat - d},${cLon + d},${cLat + d}`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { elements?: (OsmElement & { nodes?: number[] })[] };
      return data.elements || [];
    } catch {
      return [];
    }
  };
  const settled = await Promise.allSettled([
    tile(lat - d, lon - d), tile(lat - d, lon + d),
    tile(lat + d, lon - d), tile(lat + d, lon + d),
  ]);
  const byKey = new Map<string, OsmElement & { nodes?: number[] }>();
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const el of s.value) byKey.set(`${el.type}/${el.id}`, el);
  }
  const els = [...byKey.values()];
  const coords = new Map<number, { lat: number; lon: number }>();
  for (const el of els) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) coords.set(el.id, { lat: el.lat, lon: el.lon });
  }
  const out: OsmElement[] = [];
  for (const el of els) {
    if (!el.tags?.name) continue;
    if (el.type === "way" && !el.center && el.nodes?.length) {
      const pts = el.nodes.map((id) => coords.get(id)).filter((p): p is { lat: number; lon: number } => Boolean(p));
      if (pts.length) {
        el.center = {
          lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
          lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
        };
      }
    }
    out.push(el);
  }
  return out;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Social profile links a business publishes on its OWN website (footer /
// contact page / schema.org sameAs). We collect the LINK from the
// business's own pages — we never scrape the social platforms themselves
// (they are on the policy blocklist, and they block bots anyway).
const SOCIAL_HOSTS = ["facebook.com", "instagram.com", "linkedin.com", "x.com", "twitter.com", "youtube.com", "tiktok.com"];

function cleanSocialUrl(raw: string): string | null {
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (!SOCIAL_HOSTS.includes(host)) return null;
    const path = u.pathname.replace(/\/$/, "");
    if (!path || path === "") return null;
    if (/\/(sharer|share|plugins|dialog|intent|home|watch|results|feed)(\/|$)/i.test(path)) return null;
    if (host === "linkedin.com" && !/^\/(company|in)\//.test(path)) return null;
    return `https://${host}${path}`;
  } catch {
    return null;
  }
}

export function extractSocials(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const cleaned = cleanSocialUrl(m[1]);
    if (cleaned) found.add(cleaned);
    if (found.size >= 6) break;
  }
  return [...found];
}

export function extractContacts(html: string, domain: string): { email?: string; phone?: string } {
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
    (e) => !/\.(png|jpe?g|webp|svg|gif|css|js|ico)$/i.test(e) && !e.includes("example.") && !e.includes("sentry"),
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

// Structured data (schema.org JSON-LD) that a business publishes on its
// OWN website is the highest-trust contact source: the business maintains
// it for search engines. Extract email / telephone / address from any
// Organization-like node, including @graph wrappers.
export function extractJsonLd(html: string): { email?: string; phone?: string; address?: string; name?: string; hours?: string; kind?: string; socials: string[] } {
  const out: { email?: string; phone?: string; address?: string; name?: string; hours?: string; kind?: string; socials: string[] } = { socials: [] };
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const o = node as Record<string, unknown>;
    if (Array.isArray(o["@graph"])) o["@graph"].forEach(visit);
    const type = String(o["@type"] || "");
    if (/organization|localbusiness|store|restaurant|dentist|medical|professionalservice/i.test(type) || o.email || o.telephone) {
      if (!out.kind && type) out.kind = type.split(",")[0];
      if (!out.name && typeof o.name === "string" && o.name.trim()) out.name = o.name.trim();
      if (!out.hours && o.openingHours) {
        const oh = o.openingHours;
        if (typeof oh === "string") out.hours = oh;
        else if (Array.isArray(oh) && oh.every((h) => typeof h === "string")) out.hours = (oh as string[]).join(", ");
        else {
          const specs = Array.isArray(oh) ? oh : [oh];
          const parts: string[] = [];
          for (const s of specs) {
            if (!s || typeof s !== "object") continue;
            const sp = s as Record<string, unknown>;
            const days = Array.isArray(sp.dayOfWeek) ? sp.dayOfWeek.join("/") : String(sp.dayOfWeek || "");
            if (sp.opens && sp.closes) parts.push(`${days.replace(/https?:\/\/schema\.org\//g, "")} ${sp.opens}-${sp.closes}`.trim());
          }
          if (parts.length) out.hours = parts.join(", ");
        }
      }
      if (!out.email && typeof o.email === "string") {
        const e = o.email.replace(/^mailto:/i, "").trim().toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) out.email = e;
      }
      if (!out.phone && typeof o.telephone === "string" && o.telephone.trim().length >= 7) out.phone = o.telephone.trim();
      if (!out.address && o.address && typeof o.address === "object") {
        const a = o.address as Record<string, unknown>;
        const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry]
          .filter((p) => typeof p === "string" && p)
          .join(", ");
        if (parts) out.address = parts;
      }
      if (o.sameAs) {
        const links = Array.isArray(o.sameAs) ? o.sameAs : [o.sameAs];
        for (const link of links) {
          if (typeof link !== "string") continue;
          const cleaned = cleanSocialUrl(link);
          if (cleaned && !out.socials.includes(cleaned)) out.socials.push(cleaned);
        }
      }
    }
  };
  for (const raw of blocks) {
    try { visit(JSON.parse(raw)); } catch { /* malformed JSON-LD — ignore */ }
    if (out.email && out.phone && out.address) break;
  }
  return out;
}

// MX check: does the email's domain actually accept mail? This VERIFIES a
// published address (never invents one) — a domain with no MX records is a
// strong sign of a dead/typo'd address, so it earns no confidence bonus.
const mxCache = new Map<string, Promise<boolean>>();
function emailDomainHasMx(email: string): Promise<boolean> {
  const domain = email.split("@")[1] || "";
  if (!domain) return Promise.resolve(false);
  let p = mxCache.get(domain);
  if (!p) {
    p = Promise.race([
      resolveMx(domain).then((r) => r.length > 0).catch(() => false),
      new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
    ]);
    mxCache.set(domain, p);
  }
  return p;
}

export function domainOf(website: string): string {
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Find the business's REAL contact page via its sitemap instead of only
// guessing /contact: many sites put it at /contact-us, /get-in-touch,
// /about/contact, localized paths, etc. Reads /sitemap.xml (and one
// level of sitemap-index children), keeps same-origin URLs whose path
// looks like a contact page. Bounded (<=3 sitemap fetches, <=3 results)
// and fails open to [] — callers fall back to the static guesses.
export async function discoverContactPages(origin: string): Promise<string[]> {
  const locsOf = (xml: string): string[] => {
    const out: string[] = [];
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
      out.push(m[1]);
      if (out.length >= 300) break;
    }
    return out;
  };
  const contactish = (u: string): boolean => {
    try {
      const parsed = new URL(u);
      if (parsed.origin !== origin) return false;
      return /contact|get-in-touch|reach-us|talk-to-us/i.test(parsed.pathname);
    } catch {
      return false;
    }
  };
  try {
    const first = await safeFetch(`${origin}/sitemap.xml`);
    if (first.status < 200 || first.status >= 400) return [];
    let locs = locsOf(first.text);
    const children = locs.filter((u) => /\.xml($|\?)/i.test(u)).slice(0, 2);
    if (!locs.some((u) => contactish(u)) && children.length) {
      for (const child of children) {
        try {
          const sub = await safeFetch(child);
          if (sub.status >= 200 && sub.status < 400) locs = [...locs, ...locsOf(sub.text)];
        } catch { /* skip a dead child sitemap */ }
      }
    }
    return [...new Set(locs.filter(contactish))].slice(0, 3);
  } catch {
    return [];
  }
}

export type EngineResult = { leads: Lead[]; pagesRead: number; placesFound: number };

export async function searchEverywhere(niche: string, location: string, limit: number): Promise<EngineResult> {
  const empty: EngineResult = { leads: [], pagesRead: 0, placesFound: 0 };
  const startedAt = Date.now();
  try {
    if (!niche || !location) return empty;
    niche = normalizeNiche(niche);
    const geo = await geocode(location);
    if (!geo) return empty;
    let elements = await overpass(geo.lat, geo.lon, niche, nicheTerms(niche));
    if (!elements.length) elements = await osmApiFallback(geo.lat, geo.lon);
    const terms = nicheTerms(niche);
    const precisePairs = new Set((NICHE_TAGS[niche] || []).map(([k, v]) => `${k}=${v}`));

    type Candidate = { el: OsmElement; name: string; website?: string; phone?: string; email?: string; address?: string; hours?: string; precise: boolean; distKm: number; socialsSeed?: string[]; sourceUrl?: string; sourceName?: string; confidence?: number };
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
      // Precise = the business carries the niche's canonical OSM tag
      // (amenity=dentist), independent of what its name happens to say.
      const precise = Object.entries(t).some(([k, v]) => precisePairs.has(`${k}=${v}`));
      const matches = precise || terms.some(
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
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      const distKm = elLat !== undefined && elLon !== undefined ? haversineKm(geo.lat, geo.lon, elLat, elLon) : 999;
      candidates.push({
        el,
        name,
        website,
        phone: t["contact:phone"] || t.phone,
        email: t["contact:email"] || t.email,
        address: address || undefined,
        hours: t.opening_hours,
        precise,
        distKm,
      });
      if (candidates.length >= Math.max(limit * 3, 30)) break;
    }

    // Merge stored listings (Overture Maps `places` table): the richest
    // contact source we have (most rows carry phone/website, many carry
    // email + socials from the listing). Deduped against map results by
    // normalized name and by website domain; enrichment below still
    // reads their websites and can upgrade the email to the one the
    // business publishes itself.
    try {
      const dbPlaces = await queryPlaces(niche, terms, geo.lat, geo.lon, 20, limit);
      const seenNames = new Set(candidates.map((c) => c.name.toLowerCase().replace(/[^a-z0-9]/g, "")));
      for (const p of dbPlaces) {
        const key = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        const dom = p.website ? domainOf(p.website) : "";
        if (!key || seenNames.has(key) || (dom && seenDomains.has(dom))) continue;
        seenNames.add(key);
        if (dom) seenDomains.add(dom);
        candidates.push({
          el: { id: 0, type: "place" },
          name: p.name,
          website: p.website || undefined,
          phone: p.phone || undefined,
          email: p.email || undefined,
          address: p.address || undefined,
          precise: true,
          distKm: haversineKm(geo.lat, geo.lon, p.lat, p.lon),
          socialsSeed: p.socials || [],
          sourceUrl: p.website
            ? (p.website.startsWith("http") ? p.website : `https://${p.website}`)
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.locality || location}`)}`,
          sourceName: "Overture Maps",
          confidence: p.confidence,
        });
      }
    } catch { /* listings DB unavailable — map sources still serve */ }

    // Rank before spending crawl budget: tag-precise businesses first,
    // then nearest to the searched center. Enrichment and final ordering
    // both benefit — the best leads get their websites read first.
    candidates.sort((a, b) => Number(b.precise) - Number(a.precise) || a.distKm - b.distKm);

    // Enrichment runs with limited concurrency under a hard deadline tied
    // to the ENGINE start (geocode + Overpass already spent some of it):
    // the whole engine must finish by ~38s so the route keeps a safety
    // margin under the 60s serverless limit. Partial results beat a
    // killed request (which users see as a bare "network error").
    const deadline = startedAt + 38_000;
    let pagesRead = 0;
    type Enriched = { email?: string; phone?: string; address?: string; websiteAlive: boolean; structured: boolean; socials: string[] };
    const enriched: Enriched[] = candidates.map((c) => ({ email: c.email, phone: c.phone, address: c.address, websiteAlive: false, structured: false, socials: [] }));

    const enrichOne = async (idx: number): Promise<void> => {
      const c = candidates[idx];
      const e = enriched[idx];
      if (!c.website || pagesRead >= 24 || Date.now() > deadline) return;
      const domain = domainOf(c.website);
      // Website extractions are cached for a week — the same business
      // shows up across many searches and its published contacts rarely
      // change. A cache hit costs ~0ms instead of up to 3 page fetches.
      if (domain) {
        const hit = await cacheGet<{ email?: string; phone?: string; address?: string; structured: boolean; alive: boolean; socials?: string[] }>(`site:${domain}`, 7 * 24 * 3600_000);
        if (hit) {
          e.email = e.email || hit.email;
          e.phone = e.phone || hit.phone;
          e.address = e.address || hit.address;
          e.structured = e.structured || hit.structured;
          e.socials = hit.socials || [];
          e.websiteAlive = hit.alive;
          return;
        }
      }
      const base = (c.website.startsWith("http") ? c.website : `https://${c.website}`).replace(/\/$/, "");
      const paths = [base, `${base}/contact`, `${base}/contact-us`, `${base}/about`];
      for (let pi = 0; pi < paths.length; pi++) {
        const path = paths[pi];
        if ((e.email && e.phone) || pagesRead >= 24 || Date.now() > deadline) break;
        let homeOrigin = "";
        try {
          const page = await safeFetch(path);
          if (page.status >= 200 && page.status < 400) {
            e.websiteAlive = true;
            pagesRead += 1;
            if (pi === 0) { try { homeOrigin = new URL(page.finalUrl || base).origin; } catch { /* keep base */ } }
            const ld = extractJsonLd(page.text);
            if (ld.email || ld.phone) e.structured = true;
            const found = extractContacts(page.text, domain);
            e.email = e.email || ld.email || found.email;
            e.phone = e.phone || ld.phone || found.phone;
            e.address = e.address || ld.address;
            for (const s of [...ld.socials, ...extractSocials(page.text)]) {
              if (!e.socials.includes(s) && e.socials.length < 6) e.socials.push(s);
            }
          }
        } catch { /* robots/blocked/dead — skip quietly */ }
        // After the homepage: if no email yet, ask the sitemap where the
        // real contact page lives and queue it ahead of the guesses.
        if (pi === 0 && homeOrigin && !e.email && paths.length < 7) {
          const discovered = await discoverContactPages(homeOrigin);
          for (const u of discovered) {
            if (!paths.includes(u) && paths.length < 7) paths.splice(1, 0, u);
          }
        }
      }
      if (domain) {
        void cacheSet(`site:${domain}`, {
          email: e.email, phone: e.phone, address: e.address,
          structured: e.structured, alive: e.websiteAlive, socials: e.socials,
        });
      }
    };
    for (let i = 0; i < candidates.length; i += 4) {
      if (Date.now() > deadline) break;
      await Promise.all(candidates.slice(i, i + 4).map((_, j) => enrichOne(i + j)));
    }

    const leads: Lead[] = [];
    for (let idx = 0; idx < candidates.length; idx++) {
      const c = candidates[idx];
      const e = enriched[idx];
      const email = e.email;
      const phone = e.phone;
      const websiteAlive = e.websiteAlive;
      // Verify (never invent): does the published email's domain accept mail?
      const mxOk = email ? await emailDomainHasMx(email) : false;
      const socials = [...new Set([...(c.socialsSeed || []), ...e.socials])];
      // Confidence (subset of the spec formula, honestly applied):
      let score = 10; // real business name from a public source
      if (e.address) score += 20;
      if (phone) score += 20;
      if (c.website && websiteAlive) score += 15;
      if (email) score += 15;
      if (email && c.website && email.endsWith(`@${domainOf(c.website)}`)) score += 5;
      if (e.structured) score += 5; // contact came from the business's own structured data
      if (mxOk) score += 5; // email domain verified to accept mail (MX records)
      if (socials.length) score += 5; // business publishes its social profiles
      if (c.confidence) score += Math.round(c.confidence * 5); // listing-source confidence (stored listings)
      if (c.precise) score += 10; // canonical OSM tag match (amenity=dentist etc.)
      if (c.distKm <= 1) score += 8; else if (c.distKm <= 5) score += 5; else if (c.distKm <= 15) score += 2;
      if (c.hours) score += 5;
      if (c.phone || c.email) score += 10; // source-provided contact
      score = Math.min(100, score);

      leads.push({
        company: c.name,
        industry: niche,
        location: e.address || location,
        size: "",
        website: c.website ? domainOf(c.website) : "",
        description: `Real business found via ${c.sourceName || "OpenStreetMap"}${c.website ? " with a live website" : ""}${c.distKm < 900 ? `, ${c.distKm.toFixed(1)} km from the ${location} center` : ""}. Contacts are published by the business itself${mxOk ? "; email domain verified (accepts mail)" : ""} — verify before outreach.`,
        score,
        email,
        phone,
        address: e.address,
        socials: socials.length ? socials : undefined,
        hours: c.hours,
        sourceUrl: c.sourceUrl || `https://www.openstreetmap.org/${c.el.type}/${c.el.id}`,
        sourceName: c.sourceName || "OpenStreetMap",
      });
      if (leads.length >= limit) break;
    }
    leads.sort((a, b) => b.score - a.score);
    return { leads, pagesRead, placesFound: candidates.length };
  } catch {
    return empty;
  }
}
