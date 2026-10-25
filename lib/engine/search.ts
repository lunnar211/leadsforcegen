import "server-only";
import { resolveMx } from "node:dns/promises";
import { safeFetch } from "@/lib/safe-fetch";
import { cacheGet, cacheSet } from "@/lib/cache";
import { queryPlaces, KNOWN_NICHES, matchNicheByTokens } from "@/lib/engine/placesDb";
import { discoverViaCse, type CseCandidate } from "@/lib/engine/cse";
import { aiVerifyLeads } from "@/lib/engine/verify";
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
  // Real OSM object reference (Nominatim leg only): Nominatim search
  // rows carry osm_type/osm_id, which the OSM-details step uses to
  // fetch the object's published tags. Absent when the row didn't
  // carry them — those leads simply skip the details step.
  osmType?: string;
  osmId?: number;
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
  // Car family (2026-10-24: "Car owners" in Dubai returned empty even
  // though Dubai holds car dealers — no car entry existed at all, so the
  // niche passed through unmapped and matched nothing anywhere).
  car: "car dealer", cars: "car dealer", "car dealer": "car dealer", "car dealers": "car dealer",
  "car owners": "car dealer", "auto dealer": "car dealer", "auto dealers": "car dealer", automotive: "car dealer",
  // Plurals for niches the category map already knows (same bug class:
  // "schools"/"banks" passed through unmapped and only name-matched).
  school: "school", schools: "school", teacher: "teacher", teachers: "teacher",
  bank: "bank", banks: "bank", "real estate": "real estate", "travel agency": "travel agency",
  "travel agencies": "travel agency", training: "training",
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

// Free-text intent (2026-10-24): clients type ANYTHING ("car owners",
// "shops that fix phones", "people who need loans") — the engine must
// understand the intent and map it onto a real business category, never
// invent businesses. Resolution chain, in order:
//   1. canonical map / near-miss spelling (normalizeNiche)
//   2. token match against the measured category vocabulary
//   3. AI classifier that may ONLY pick from KNOWN_NICHES (validated —
//      any other output is rejected, so it can never invent a category)
//   4. pass-through (name fallback, then AI prospects, then honest empty)
const NICHE_STOPWORDS = new Set([
  "owner", "owners", "service", "services", "shop", "shops", "store", "stores",
  "company", "companies", "business", "businesses", "near", "me", "best", "top",
  "local", "find", "finding", "looking", "for", "in", "and", "the", "a", "an",
  "who", "need", "needs", "want", "wants", "list", "of", "show", "around",
  "that", "which", "with", "all", "any", "please", "get", "got",
]);

function nicheTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t))
    .filter((t) => t.length >= 3 && !NICHE_STOPWORDS.has(t));
}

async function classifyNiche(raw: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const prompt = `The user typed a business search phrase: "${raw}". Pick the SINGLE closest business category from this exact list, or NONE if none fits: ${KNOWN_NICHES.join(", ")}. Reply with ONLY the category name or NONE, nothing else.`;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (data.choices?.[0]?.message?.content || "").trim().toLowerCase();
    return KNOWN_NICHES.includes(text) ? text : null;
  } catch {
    return null;
  }
}

async function resolveNiche(raw: string): Promise<{ niche: string; mapped: boolean }> {
  const canonical = normalizeNiche(raw);
  if (KNOWN_NICHES.includes(canonical)) return { niche: canonical, mapped: true };
  const tokens = nicheTokens(raw);
  const byToken = tokens.length ? matchNicheByTokens(tokens) : null;
  if (byToken) return { niche: byToken, mapped: true };
  const classified = await classifyNiche(raw);
  if (classified) return { niche: classified, mapped: true };
  return { niche: canonical, mapped: false };
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
    "car dealer": ["car dealer", "auto dealer", "automotive"],
    school: ["school", "college", "university"],
    bank: ["bank"],
    "real estate": ["estate", "realtor", "property"],
    "travel agency": ["travel"],
    bakery: ["bakery"],
    bar: ["bar", "pub"],
    supermarket: ["supermarket", "grocery"],
    "car repair": ["car repair", "auto repair", "garage"],
    vet: ["veterinary", "vet"],
    florist: ["florist", "flowers"],
    bookstore: ["bookstore", "books"],
    optician: ["optician", "optometrist"],
    accountant: ["accountant", "accounting"],
    architect: ["architect", "architecture"],
  };
  for (const s of synonyms[base] || synonyms[singular] || []) terms.add(s);
  return [...terms].filter(Boolean);
}

async function geocode(location: string): Promise<{ lat: number; lon: number; broad: boolean } | null> {
  // Namespace bumped to geo3: (2026-10-24) — geo2: rows lack the broad
  // flag below, and re-geocoding is cheap.
  const cacheKey = `geo3:${location.toLowerCase().trim()}`;
  const cached = await cacheGet<{ lat: number; lon: number; broad: boolean }>(cacheKey, 30 * 24 * 3600_000);
  if (cached) return cached;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(location)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { lat: string; lon: string; addresstype?: string; type?: string }[];
  if (!data.length) return null;
  // Disambiguation fix (2026-10-24, proven by SQL diagnostic): a bare
  // "New York" used to resolve to the STATE (Nominatim's first result),
  // whose 20km box holds zero stored businesses — while the Manhattan
  // box holds 37,702 restaurants. Prefer a real settlement over admin
  // areas; Nominatim returns results importance-ordered, so the first
  // settlement match is the best city candidate.
  const settlement = data.find((d) =>
    ["city", "town", "village", "municipality", "suburb", "hamlet", "borough"].includes(d.addresstype || d.type || ""),
  );
  const pick = settlement || data[0];
  // broad = no settlement among Nominatim's results: the pick is a
  // country/state/county, so a 20 km box around its center is nearly
  // meaningless. The engine still searches (the box sometimes lands on
  // a town), but an empty result becomes guidance instead of a dead
  // end (see the route's empty note).
  const point = { lat: Number(pick.lat), lon: Number(pick.lon), broad: !settlement };
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
  "car dealer": [["shop", "car"]],
  // 2026-10-24 find-anyhow expansion: these niches had stored-DB
  // categories but NO map tags, so outside covered cities they fell
  // back to weak name matching only — school/bank searches abroad
  // came back empty while dentist searches (precise amenity tag)
  // worked. That gap is exactly why users saw "only doctors work".
  school: [["amenity", "school"], ["amenity", "college"], ["amenity", "university"], ["amenity", "kindergarten"]],
  teacher: [["amenity", "school"], ["amenity", "college"], ["amenity", "university"]],
  training: [["amenity", "school"], ["amenity", "college"], ["office", "educational_institution"]],
  bank: [["amenity", "bank"]],
  "real estate": [["office", "estate_agent"]],
  "travel agency": [["office", "travel_agent"], ["shop", "travel_agency"]],
  // Professions with no stored-DB category at all: the map path is
  // their only source, so they get tags + name terms even though the
  // DB query can only name-match them in covered cities.
  bakery: [["shop", "bakery"]],
  bar: [["amenity", "bar"], ["amenity", "pub"]],
  supermarket: [["shop", "supermarket"], ["shop", "grocery"], ["shop", "convenience"]],
  "car repair": [["shop", "car_repair"]],
  vet: [["amenity", "veterinary"]],
  florist: [["shop", "florist"]],
  bookstore: [["shop", "books"]],
  optician: [["shop", "optician"], ["healthcare", "optometrist"]],
  accountant: [["office", "accountant"]],
  architect: [["office", "architect"]],
};

async function overpass(lat: number, lon: number, niche: string, terms: string[]): Promise<OsmElement[]> {
  const regex = terms.join("|").replace(/[^a-z0-9| ]/g, "");
  const clauses: string[] = [];
  // DENSE-CITY FIX (2026-10-24, measured): the two regex clauses scan
  // every object in a 20 km radius (1,256 km²) — in London that never
  // answers inside the 15s budget, so dense cities came back empty
  // while sparse areas worked. Tag lookups are indexed and answer in
  // seconds even in London, so mapped niches now query tags ONLY.
  // Tag-less (pass-through) niches keep the name regex but at 5 km
  // (79 km², 16x less area). The 15s cap is NOT raised: geocode ≤6s +
  // map 15s + enrichment 38s ≈ 59s vs the 60s serverless max.
  const tags = NICHE_TAGS[niche] || [];
  if (tags.length) {
    for (const [k, v] of tags) {
      clauses.push(`nwr["${k}"="${v}"](around:20000,${lat},${lon});`);
    }
  } else {
    clauses.push(`nwr["name"~"${regex}",i](around:5000,${lat},${lon});`);
  }
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
// times out for datacenter IPs). A 3x3 tile grid of map calls covers
// roughly 12km x 12km around the geocoded center, fetched in parallel
// and deduped. Used ONLY when every Overpass mirror fails; searches
// are cached, so this stays occasional. Ways get a center computed
// from their member nodes in the same payload. OSM_API_URL override
// exists for testing.
//
// ADAPTIVE SPLITTING (2026-10-25, Delhi dentists returned ZERO):
// in dense cities every 0.11° tile 400s on the API's 50k-node limit,
// so the old grid returned nothing and the only fallback was one
// 0.38km center tile — which often holds zero businesses of the
// searched niche. Now a 400 splits that tile into 4 quadrants and
// retries, down to ~0.38km-wide tiles: dense areas answer with real
// multi-kilometre coverage instead of nothing. Bounded: 6-way
// concurrency, 60 fetches max, no new fetch started after 11s.
async function osmApiFallback(lat: number, lon: number): Promise<OsmElement[]> {
  const base = process.env.OSM_API_URL || "https://api.openstreetmap.org/api/0.6";
  const d = 0.055; // tile half-box (~6 km); grid covers +/-0.11 deg (~12 km)
  const started = Date.now();
  const byKey = new Map<string, OsmElement & { nodes?: number[] }>();
  type Job = { cLat: number; cLon: number; half: number };
  const queue: Job[] = [
    { cLat: lat - d, cLon: lon - d, half: d }, { cLat: lat - d, cLon: lon, half: d }, { cLat: lat - d, cLon: lon + d, half: d },
    { cLat: lat, cLon: lon - d, half: d }, { cLat: lat, cLon: lon, half: d }, { cLat: lat, cLon: lon + d, half: d },
    { cLat: lat + d, cLon: lon - d, half: d }, { cLat: lat + d, cLon: lon, half: d }, { cLat: lat + d, cLon: lon + d, half: d },
  ];
  let fetches = 0;
  const worker = async () => {
    while (queue.length > 0) {
      if (fetches >= 60 || Date.now() - started > 11_000) return;
      const job = queue.shift();
      if (!job) return;
      fetches++;
      try {
        const url = `${base}/map.json?bbox=${job.cLon - job.half},${job.cLat - job.half},${job.cLon + job.half},${job.cLat + job.half}`;
        const res = await fetch(url, {
          headers: { "User-Agent": UA, Accept: "application/json" },
          signal: AbortSignal.timeout(12000),
        });
        if (res.status === 400 && job.half > 0.0017) {
          // Too many nodes in this tile: split into 4 quadrants.
          const h = job.half / 2;
          queue.push(
            { cLat: job.cLat - h, cLon: job.cLon - h, half: h },
            { cLat: job.cLat - h, cLon: job.cLon + h, half: h },
            { cLat: job.cLat + h, cLon: job.cLon - h, half: h },
            { cLat: job.cLat + h, cLon: job.cLon + h, half: h },
          );
          continue;
        }
        if (!res.ok) continue;
        const data = (await res.json()) as { elements?: (OsmElement & { nodes?: number[] })[] };
        for (const el of data.elements || []) byKey.set(`${el.type}/${el.id}`, el);
      } catch {
        // A failed tile just narrows coverage; other tiles still answer.
      }
    }
  };
  await Promise.allSettled([worker(), worker(), worker(), worker(), worker(), worker()]);
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

// City-wide backstop: Nominatim's full-text search over OSM objects.
// One request ("dentist in Delhi, India") returns real POIs across the
// whole city — no tiles, no 50k-node limit — where the tile grid can
// still come up empty in ultra-dense cores. Results carry name +
// location + class/type (e.g. amenity=dentist) but usually no phone or
// website, so this leg runs DELAYED 8s inside the map race: Overpass
// and the split-tile OSM leg get first shot at richer results, and
// Nominatim only wins when they are empty or slow. It answers by
// ~14s, inside the 15s map cap. Nominatim's policy (1 req/s, named
// User-Agent) is respected: one call per search, identified UA.
const BUSINESS_KEYS = new Set(["amenity", "shop", "office", "tourism", "leisure", "healthcare", "craft"]);
async function nominatimPoi(niche: string, location: string): Promise<OsmElement[]> {
  try {
    const q = `${niche} in ${location}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=50&addressdetails=0&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as { place_id?: number; osm_type?: string; osm_id?: number; lat?: string; lon?: string; display_name?: string; class?: string; type?: string }[];
    const out: OsmElement[] = [];
    for (const r of rows) {
      const name = (r.display_name || "").split(",")[0].trim();
      const plat = parseFloat(r.lat || "");
      const plon = parseFloat(r.lon || "");
      if (!name || !Number.isFinite(plat) || !Number.isFinite(plon)) continue;
      const tags: Record<string, string> = { name };
      if (r.class && BUSINESS_KEYS.has(r.class) && r.type) tags[r.class] = r.type;
      // Keep the REAL OSM object reference: Nominatim's place_id is a
      // search-index id, not an OSM object id, so the old code's
      // sourceUrl (…/node/<place_id>) pointed at the wrong object.
      // With osm_type/osm_id the source link and the details lookup
      // below both address the actual object. Rows without them keep
      // the old fallback and simply skip the details step.
      const osmType = ["node", "way", "relation"].includes(r.osm_type || "") ? (r.osm_type as string) : undefined;
      const osmId = typeof r.osm_id === "number" && r.osm_id > 0 ? r.osm_id : undefined;
      out.push({
        type: osmType || "node",
        id: osmId || r.place_id || 0,
        lat: plat,
        lon: plon,
        tags,
        ...(osmType && osmId ? { osmType, osmId } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
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

export type EngineResult = { leads: Lead[]; pagesRead: number; placesFound: number; aiFiltered?: number; resolvedNiche?: string; broadLocation?: boolean };

export async function searchEverywhere(niche: string, location: string, limit: number, startedAtOverride?: number): Promise<EngineResult> {
  const empty: EngineResult = { leads: [], pagesRead: 0, placesFound: 0 };
  // WALL CLOCK (2026-10-25): the route passes its own entry timestamp
  // so every deadline below counts the cold start + route pre-work,
  // not just the engine. Without this, a ~26s cold start plus a 30s
  // engine ceiling plus route work landed right on the 60s
  // serverless limit and restaurants/London 504'd seven times.
  // Callers that omit the override get the old engine-entry behavior.
  const startedAt = startedAtOverride ?? Date.now();
  // Phase timings (2026-10-25): server-side only, no user data —
  // just phase names + ms + counts. The restaurants/London 504s
  // survived every budget lever, so the next diagnosis needs to SEE
  // where time actually goes instead of inferring it. These lines
  // are what the Vercel function logs show for a timed-out request.
  const tlog = (label: string, extra = "") => {
    try { console.log(`[lfg-timing] ${label} ${Date.now() - startedAt}ms${extra ? ` ${extra}` : ""}`); } catch { /* logging never breaks a search */ }
  };
  let resolvedNiche: string | undefined;
  let broadLocation = false;
  try {
    if (!niche || !location) return empty;
    const rawNiche = niche;
    const resolved = await resolveNiche(niche);
    niche = resolved.niche;
    // The UI note tells the user what their words were understood as,
    // so a "car owners" search transparently shows "car dealers".
    if (resolved.mapped && niche.toLowerCase() !== rawNiche.toLowerCase().trim()) resolvedNiche = niche;
    const geo = await geocode(location);
    if (!geo) return { ...empty, resolvedNiche };
    tlog("geocode", `broad=${geo.broad}`);
    broadLocation = geo.broad;
    const terms = nicheTerms(niche);
    // SPEED (2026-10-24): the stored DB answers in milliseconds, but
    // the old code awaited the 15s-capped map race on EVERY search —
    // even covered-city searches whose DB rows already fill the
    // request. Await the DB first: if it alone fills `limit`, skip the
    // map race and CSE entirely (DB latency added to the other path
    // is milliseconds). Empty/uncovered searches still run the full
    // discovery set, capped as before.
    const dbPlaces = await queryPlaces(niche, terms, geo.lat, geo.lon, 20, limit).catch(() => []);
    tlog("db", `rows=${dbPlaces.length}`);
    let elements: OsmElement[] = [];
    let mapLeg = "none";
    let cseRows: CseCandidate[] = [];
    // WALL-CLOCK MAP GATE (2026-10-25): a 15s map race starting after
    // 38s of function time leaves no room for route work — skip it and
    // serve DB-only results (or the honest-empty path) instead of
    // letting Vercel kill the request.
    if (dbPlaces.length < limit && Date.now() - startedAt < 38_000) {
      // FIND-ANYHOW (2026-10-24): Overpass mirrors reject datacenter IPs,
      // and the old chain awaited Overpass FIRST — so when mirrors hung,
      // the 15s cap fired before the OSM API fallback ever ran, and the
      // fallback's results were discarded even when it would have
      // worked. Race BOTH sources in parallel and take the first
      // NON-EMPTY answer, capped at 15s.
      const nonEmpty = (p: Promise<OsmElement[]>) =>
        p.then((els) => (els.length ? els : Promise.reject(new Error("empty"))));
      // LEG LABELING (2026-10-24): the race winner was invisible — both
      // legs surfaced as plain "OpenStreetMap", so a dense-city failure
      // could not say WHICH leg died. Tag each leg's result with its
      // winner (request-scoped local, never module state) so the lead's
      // provenance names the actual source. This is also better
      // provenance for users, permanently.
      const delayedNominatim = new Promise<OsmElement[]>((resolve) =>
        setTimeout(() => nominatimPoi(niche, location).then(resolve, () => resolve([])), 8000),
      );
      const mapChain = Promise.any([
        nonEmpty(overpass(geo.lat, geo.lon, niche, terms)).then((els) => ({ els, leg: "overpass" })),
        nonEmpty(osmApiFallback(geo.lat, geo.lon)).then((els) => ({ els, leg: "osm-api" })),
        nonEmpty(delayedNominatim).then((els) => ({ els, leg: "nominatim" })),
      ]).catch(() => ({ els: [] as OsmElement[], leg: "none" }));
      const mapCap = new Promise<{ els: OsmElement[]; leg: string }>((r) =>
        setTimeout(() => r({ els: [], leg: "timeout" }), 15000),
      );
      const [mapWon, cseWon] = await Promise.all([
        Promise.race([mapChain, mapCap]),
        discoverViaCse(niche, location, limit).catch(() => []),
      ]);
      elements = mapWon.els;
      cseRows = cseWon;
      mapLeg = mapWon.leg;
      tlog("map", `leg=${mapLeg} els=${elements.length} cse=${cseRows.length}`);
    }
    const precisePairs = new Set((NICHE_TAGS[niche] || []).map(([k, v]) => `${k}=${v}`));

    type Candidate = { el: OsmElement; name: string; website?: string; phone?: string; email?: string; address?: string; hours?: string; precise: boolean; distKm: number; socialsSeed?: string[]; sourceUrl?: string; sourceName?: string; confidence?: number; osmDetails?: boolean };
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
      // BUSINESS-ONLY (2026-10-25): the name match admitted non-business
      // OSM objects — "Default access to school play grounds in England"
      // is an access object, not a school. An element with none of the
      // seven business tag keys is not a business, whatever its name says.
      if (!tagValues) continue;
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
        sourceName:
          mapLeg === "overpass"
            ? "OpenStreetMap (Overpass)"
            : mapLeg === "osm-api"
              ? "OpenStreetMap (OSM API)"
              : mapLeg === "nominatim"
                ? "OpenStreetMap (Nominatim)"
                : "OpenStreetMap",
      });
      if (candidates.length >= Math.max(limit * 3, 30)) break;
    }

    // Merge stored listings (Overture Maps `places` table): the richest
    // contact source we have (most rows carry phone/website, many carry
    // email + socials from the listing). Deduped against map results by
    // normalized name and by website domain; enrichment below still
    // reads their websites and can upgrade the email to the one the
    // business publishes itself.
    {
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
    }

    // Discovery booster (env-gated): Google Programmable Search with
    // operator queries finds businesses the map databases miss. These
    // arrive with only a name + website — enrichment below reads their
    // own pages and verifies contacts exactly like every other source,
    // so a CSE candidate with no reachable site simply scores low.
    {
      const seenNames = new Set(candidates.map((c) => c.name.toLowerCase().replace(/[^a-z0-9]/g, "")));
      for (const r of cseRows) {
        const key = r.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        const dom = domainOf(r.website);
        if (!key || seenNames.has(key) || (dom && seenDomains.has(dom))) continue;
        seenNames.add(key);
        if (dom) seenDomains.add(dom);
        candidates.push({
          el: { id: 0, type: "cse" },
          name: r.name,
          website: r.website,
          precise: false,
          distKm: 999,
          sourceUrl: r.sourceUrl,
          sourceName: "Google Programmable Search",
        });
      }
    }

    // Rank before spending crawl budget: tag-precise businesses first,
    // then nearest to the searched center. Enrichment and final ordering
    // both benefit — the best leads get their websites read first.
    candidates.sort((a, b) => Number(b.precise) - Number(a.precise) || a.distKm - b.distKm);

    // Enrichment runs with limited concurrency under a hard deadline tied
    // to the FUNCTION start (the route passes its entry timestamp, so
    // cold start + geocode + map already spent some of it):
    // the whole engine must finish by ~44s so the route + a cold start
    // keep a safety margin under the 60s serverless limit. Partial
    // results beat a killed request (which users see as a bare
    // "network error").
    // Tightened 2026-10-25 from 38s -> 28s -> 24s -> 20s: the saturated
    // case kept 504ing (nine timeouts on restaurants/London) because
    // the server's wake-up time sits outside every deadline measured
    // from request handling. 20s keeps a crawl window for the top
    // candidates — the ones actually returned — while leaving margin
    // for that invisible wake-up cost.
    const deadline = startedAt + 20_000;
    let pagesRead = 0;
    type Enriched = { email?: string; phone?: string; address?: string; websiteAlive: boolean; structured: boolean; socials: string[] };
    const enriched: Enriched[] = candidates.map((c) => ({ email: c.email, phone: c.phone, address: c.address, websiteAlive: false, structured: false, socials: [] }));

    // OSM-DETAILS ENRICHMENT (2026-10-25): Nominatim-leg leads arrive
    // with only a name + location — no phone, no website — which is
    // why any-city searches looked thin next to stored-DB rows. The
    // OSM object behind each one often publishes both as tags, so
    // look the object up (same public OSM API the map fallback
    // already uses) and fill them in; the normal enrichment below
    // then reads any discovered website for emails, exactly like
    // every other website candidate. Strictly bounded and fail-open:
    // first 30 Nominatim candidates in ranked order, 4 at a time, no
    // new fetch after the enrichment deadline, any failure leaves the
    // lead exactly as it was. Nothing here invents a contact — every
    // field comes from the object's published tags or the business's
    // own site, and the source label stays "OpenStreetMap
    // (Nominatim)" with the description noting the OSM-tags origin.
    {
      const targets: { idx: number; osmType: string; osmId: number }[] = [];
      for (let idx = 0; idx < candidates.length && targets.length < 30; idx++) {
        const c = candidates[idx];
        if (c.sourceName !== "OpenStreetMap (Nominatim)") continue;
        if (c.website && c.phone) continue;
        const ot = c.el.osmType;
        const oi = c.el.osmId;
        if (!ot || !oi) continue;
        targets.push({ idx, osmType: ot, osmId: oi });
      }
      const osmBase = process.env.OSM_API_URL || "https://api.openstreetmap.org/api/0.6";
      const fetchDetail = async (t: { idx: number; osmType: string; osmId: number }): Promise<void> => {
        if (Date.now() > deadline) return;
        try {
          const res = await fetch(`${osmBase}/${t.osmType}/${t.osmId}.json`, {
            headers: { "User-Agent": UA, Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) return;
          const data = (await res.json()) as { elements?: { tags?: Record<string, string> }[] };
          const tags = data.elements?.[0]?.tags || {};
          const c = candidates[t.idx];
          const e = enriched[t.idx];
          const website = tags["contact:website"] || tags.website;
          const phone = tags["contact:phone"] || tags.phone;
          let filled = false;
          if (website && !c.website) {
            // Don't adopt a website another candidate already owns —
            // the merge deduped by domain before this step ran.
            const dom = domainOf(website);
            if (!dom || !seenDomains.has(dom)) {
              c.website = website;
              if (dom) seenDomains.add(dom);
              filled = true;
            }
          }
          if (phone && !c.phone) {
            c.phone = phone;
            e.phone = phone;
            filled = true;
          }
          if (filled) c.osmDetails = true;
        } catch { /* fail-open: the bare lead still serves */ }
      };
      for (let i = 0; i < targets.length; i += 4) {
        if (Date.now() > deadline) break;
        await Promise.all(targets.slice(i, i + 4).map(fetchDetail));
      }
      tlog("osm-details", `targets=${targets.length}`);
    }

    const enrichOne = async (idx: number): Promise<void> => {
      const c = candidates[idx];
      const e = enriched[idx];
      if (!c.website || pagesRead >= 24 || Date.now() > deadline) return;
      // FAST PATH (2026-10-24): a stored listing that already carries
      // email + phone + website needs no live crawl — its contacts are
      // the business's own published data from the listing, and its
      // socials still flow via socialsSeed. Crawling it anyway cost
      // every covered-city search up to 24 slow page fetches.
      if (c.sourceName === "Overture Maps" && c.email && c.phone && c.website) return;
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
        // Deadline-checked (2026-10-25): this fetch ran even after the
        // deadline passed, adding a 5s overshoot to the last batch.
        if (pi === 0 && homeOrigin && !e.email && paths.length < 7 && Date.now() <= deadline) {
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
    tlog("enrich", `pages=${pagesRead} cands=${candidates.length}`);

    const leads: Lead[] = [];
    // Precise-map tracker (2026-10-25): stays true only if every
    // returned lead came from a precise-tag map candidate. The AI
    // filter below is skipped in that case — the tag already proves
    // the trade and the tile already proves the city.
    let allMapPrecise = true;
    const pendingMx: { idx: number; email: string }[] = [];
    for (let idx = 0; idx < candidates.length; idx++) {
      const c = candidates[idx];
      const e = enriched[idx];
      const email = e.email;
      const phone = e.phone;
      const websiteAlive = e.websiteAlive;
      const socials = [...new Set([...(c.socialsSeed || []), ...e.socials])];
      // Confidence (subset of the spec formula, honestly applied).
      // The MX bonus (+5) is applied in the parallel phase below.
      let score = 10; // real business name from a public source
      if (e.address) score += 20;
      if (phone) score += 20;
      if (c.website && websiteAlive) score += 15;
      if (email) score += 15;
      if (email && c.website && email.endsWith(`@${domainOf(c.website)}`)) score += 5;
      if (e.structured) score += 5; // contact came from the business's own structured data
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
        description: `Real business found via ${c.sourceName || "OpenStreetMap"}${c.website ? " with a live website" : ""}${c.distKm < 900 ? `, ${c.distKm.toFixed(1)} km from the ${location} center` : ""}${c.osmDetails ? ". Phone/website from its OpenStreetMap listing" : ""}. Contacts are published by the business itself — verify before outreach.`,
        score,
        email,
        phone,
        address: e.address,
        socials: socials.length ? socials : undefined,
        hours: c.hours,
        sourceUrl: c.sourceUrl || `https://www.openstreetmap.org/${c.el.type}/${c.el.id}`,
        sourceName: c.sourceName || "OpenStreetMap",
      });
      if (!(c.precise && (c.sourceName || "OpenStreetMap").startsWith("OpenStreetMap"))) allMapPrecise = false;
      if (email) pendingMx.push({ idx: leads.length - 1, email });
      if (leads.length >= limit) break;
    }
    // MX phase (2026-10-24 speed fix): the old loop awaited one DNS MX
    // lookup per lead IN SEQUENCE — 30 serial DNS round-trips on every
    // search. Same-domain lookups are already deduped by the mxCache;
    // distinct domains now resolve 8 at a time. A soft deadline keeps a
    // slow DNS day from pushing the route into a serverless timeout:
    // leads past it simply skip the +5 bonus, never the result.
    // Lowered 2026-10-25 from 50s -> 42s -> 34s -> 28s -> 24s: the
    // saturated case still 504'd once route work + cold start were
    // added. Leads past the deadline skip the +5 bonus, never the
    // result.
    const mxDeadline = startedAt + 24_000;
    for (let i = 0; i < pendingMx.length; i += 8) {
      if (Date.now() > mxDeadline) break;
      const batch = pendingMx.slice(i, i + 8);
      const results = await Promise.all(batch.map((p) => emailDomainHasMx(p.email).catch(() => false)));
      results.forEach((ok, j) => {
        if (!ok) return;
        const lead = leads[batch[j].idx];
        lead.score = Math.min(100, (lead.score || 0) + 5);
        lead.description = lead.description.replace(
          " — verify before outreach.",
          "; email domain verified (accepts mail) — verify before outreach.",
        );
      });
    }
    tlog("mx", `leads=${leads.length}`);
    leads.sort((a, b) => b.score - a.score);
    // AI originality filter (env-gated, fail-open): one batched Groq
    // call drops listings that are clearly the wrong trade or the
    // wrong city. It never adds or invents anything. Skipped for pure
    // stored-DB results: those rows are already category-matched and
    // bbox-matched, so there is nothing for the filter to catch — and
    // skipping it keeps covered-city searches off the Groq round-trip.
    // Also skipped when every returned lead is a precise-tag map result
    // (same reasoning: tag + tile already guarantee trade + city).
    let aiFiltered = 0;
    try {
      // BUDGET RACE (2026-10-25): the filter's own 12s timeout could land
      // after the MX phase and push the route past the 60s serverless
      // limit. Race it against the time left until 38s from engine
      // start (tightened 54s -> 44s -> 38s -> 30s: the 38s race still
      // 504'd on London restaurants — the inferred ~20s cold start
      // plus route work needs a 30s engine ceiling), leaving ~30s
      // for the route + cold start; a timeout
      // fails open via the catch below, exactly like a missing key.
      // SKIP (2026-10-25): when every returned lead is a precise-tag
      // map result, the filter has nothing to catch — the tag IS the
      // trade and the tile IS the city — so skip the round-trip
      // entirely. This is the saturated dense-city case.
      const budgetLeft = 30_000 - (Date.now() - startedAt);
      const v =
        (elements.length || cseRows.length) && !allMapPrecise
          ? budgetLeft > 2000
            ? await Promise.race([
                aiVerifyLeads(leads, niche, location),
                new Promise<never>((_, rej) => setTimeout(() => rej(new Error("ai budget")), budgetLeft)),
              ])
            : { kept: leads, dropped: 0 }
          : { kept: leads, dropped: 0 };
      if (v.dropped > 0) {
        leads.length = 0;
        leads.push(...v.kept);
        aiFiltered = v.dropped;
      }
    } catch { /* filter is best-effort; unfiltered results still serve */ }
    return { leads, pagesRead, placesFound: candidates.length, aiFiltered, resolvedNiche, broadLocation };
  } catch {
    return { ...empty, resolvedNiche, broadLocation };
  }
}
