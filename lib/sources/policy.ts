// Hard policy for the lead engine. Enforced inside safe-fetch and the
// ingestion paths — not just documented. Anything listed here is refused
// before any network request is made.

// Domains that must NEVER be fetched or scraped: social networks, profile
// platforms, and anything login-gated / paywalled by nature.
export const BLOCKED_HOSTS: string[] = [
  "linkedin.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "telegram.org",
  "t.me",
  "whatsapp.com",
  "wa.me",
  "reddit.com",
  "google.com", // search / maps HTML — API access only, never scraping
  "google.com.np",
  "bing.com",
  "duckduckgo.com",
  "youtube.com", // recorded as a published link only, never fetched by the crawler
  "pinterest.com",
  "snapchat.com",
  "threads.net",
];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isBlockedUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host) return true; // unparseable = blocked
  return BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`));
}

// Search-ranking domains that are directories/aggregators/social: excluded
// from the candidate-domain list, kept only as "discovery hints".
export const AGGREGATOR_HOSTS: string[] = [
  "yelp.com",
  "tripadvisor.com",
  "justdial.com",
  "indiamart.com",
  "yellowpages.com",
  "mapquest.com",
  "foursquare.com",
  "trustpilot.com",
  "glassdoor.com",
  "indeed.com",
  "crunchbase.com",
  "wikipedia.org",
  "wikidata.org",
];

export function isAggregatorUrl(url: string): boolean {
  const host = hostOf(url);
  return AGGREGATOR_HOSTS.some((b) => host === b || host.endsWith(`.${b}`));
}

// Per-domain crawl policy for directories / open-data sites. Default when a
// domain is not listed: business websites are crawlable subject to
// robots.txt; unknown directories are blocked until reviewed.
export type DomainPolicy = {
  host: string;
  allowed: boolean;
  note: string;
  lastChecked: string; // ISO date
};

export const DOMAIN_POLICIES: DomainPolicy[] = [
  { host: "nominatim.openstreetmap.org", allowed: true, note: "OSM Nominatim usage policy: 1 req/s, valid UA", lastChecked: "2026-10-22" },
  { host: "overpass-api.de", allowed: true, note: "Overpass API fair use", lastChecked: "2026-10-22" },
  { host: "index.commoncrawl.org", allowed: true, note: "Common Crawl index API, public", lastChecked: "2026-10-22" },
  { host: "query.wikidata.org", allowed: true, note: "Wikidata SPARQL, public", lastChecked: "2026-10-22" },
];

export function directoryPolicy(host: string): DomainPolicy | undefined {
  const h = host.toLowerCase().replace(/^www\./, "");
  return DOMAIN_POLICIES.find((p) => p.host === h);
}

// ---- Breach-dump detector -------------------------------------------------
// Rejects uploads / pasted data that look like leaked credential dumps:
// many rows combining emails with passwords, hashes, or combo-list markers.
// Business contact lists never contain password/hash columns.
const DUMP_HEADER_WORDS = [
  "password", "passwd", "pwd", "pass_hash", "password_hash", "hash",
  "md5", "sha1", "sha256", "bcrypt", "salt", "combo", "credential",
  "credentials", "leak", "breach", "dump",
];
const HASH_RE = /\b[a-f0-9]{32}\b|\b[a-f0-9]{40}\b|\b[a-f0-9]{64}\b|\$2[aby]\$\d{2}\$/;

export type DumpCheck = { isDump: boolean; reason: string };

export function detectBreachDump(text: string, filename = ""): DumpCheck {
  const lower = `${filename}\n${text.slice(0, 20000)}`.toLowerCase();
  if (/(combo|breach|leak|dump|fresh[ _-]?hq|hq[ _-]?combo)/.test(lower) && /@/.test(lower)) {
    return { isDump: true, reason: "Filename/content markers look like a combo or breach dump." };
  }
  const firstLines = lower.split(/\r?\n/).slice(0, 15).join("\n");
  const headerHits = DUMP_HEADER_WORDS.filter((w) => firstLines.includes(w));
  if (headerHits.length >= 1 && /@/.test(firstLines)) {
    return { isDump: true, reason: `Credential columns detected: ${headerHits.join(", ")}.` };
  }
  // Email:password combo pattern across many lines
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 200);
  const comboLines = lines.filter((l) => /[\w.+-]+@[\w-]+\.[\w.]+[:;|]\S{4,}/.test(l)).length;
  if (lines.length >= 5 && comboLines / lines.length > 0.4) {
    return { isDump: true, reason: "Most rows match the email:password combo-list pattern." };
  }
  const hashLines = lines.filter((l) => HASH_RE.test(l)).length;
  if (lines.length >= 5 && hashLines / lines.length > 0.3) {
    return { isDump: true, reason: "Most rows contain password hashes." };
  }
  return { isDump: false, reason: "" };
}
