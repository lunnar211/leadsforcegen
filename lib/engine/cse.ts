import "server-only";
import { isAggregatorUrl, isBlockedUrl } from "@/lib/sources/policy";

// Discovery booster: Google Programmable Search (Custom Search JSON API)
// — the operator-powered search ("dorking": inurl:, intitle:, site:) done
// through Google's official API with the owner's own key, instead of
// scraping google.com (which the project rules forbid and Google blocks).
//
// What it returns is ONLY candidate business websites. Every contact on
// the final lead still comes from the business's own pages via the
// engine's enrichment + verification — discovery widens, truth is still
// checked. Env-gated: without GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX this
// source is dark and the engine behaves exactly as before.
//
// Quota care: the free tier is 100 queries/day, so results are cached
// in-memory per (niche, location) for 6h and a daily counter stops well
// before the cap; a spent quota degrades to the other sources silently.

export type CseCandidate = { name: string; website: string; sourceUrl: string };

const memCache = new Map<string, { at: number; rows: CseCandidate[] }>();
let dayKey = "";
let dayCount = 0;
const DAILY_CALL_CAP = 90;
const CACHE_MS = 6 * 3600_000;

export function cseConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX);
}

function cleanName(title: string, host: string): string {
  let t = (title || "").replace(/\s+/g, " ").trim();
  // Strip the usual page-title furniture: "Contact Us | ABC Dental",
  // "ABC Dental - Home", "Welcome to ABC Dental Clinic".
  t = t.replace(/^(contact( us)?|home|welcome to|about( us)?)\s*[-|:–—]\s*/i, "");
  t = t.replace(/\s*[-|:–—]\s*(contact( us)?|home|about( us)?|official (web)?site).*$/i, "");
  t = t.replace(/\s*\|\s*[^|]{0,60}$/, "");
  if (t.length < 3) {
    // Fall back to a readable form of the domain itself.
    t = host.replace(/^www\./, "").split(".")[0].replace(/[-_]+/g, " ");
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  return t.slice(0, 90);
}

export async function discoverViaCse(niche: string, location: string, limit: number): Promise<CseCandidate[]> {
  if (!cseConfigured()) return [];
  const cacheKey = `${niche}|${location}`.toLowerCase();
  const hit = memCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows.slice(0, limit);

  const today = new Date().toISOString().slice(0, 10);
  if (dayKey !== today) { dayKey = today; dayCount = 0; }
  if (dayCount >= DAILY_CALL_CAP) return [];
  dayCount += 1;

  // Operator query: prefer the business's own contact pages — they both
  // prove it's a real operating business and feed the extractor.
  const q = `${niche} ${location} (inurl:contact OR intitle:contact OR "contact us")`;
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(process.env.GOOGLE_CSE_API_KEY!)}&cx=${encodeURIComponent(process.env.GOOGLE_CSE_CX!)}&q=${encodeURIComponent(q)}&num=10`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: { title?: string; link?: string }[] };
    const out: CseCandidate[] = [];
    const seenHosts = new Set<string>();
    for (const item of data.items || []) {
      const link = item.link || "";
      if (!link.startsWith("http")) continue;
      if (isBlockedUrl(link) || isAggregatorUrl(link)) continue; // no socials/directories — own sites only
      let host = "";
      try { host = new URL(link).hostname.toLowerCase(); } catch { continue; }
      if (!host || seenHosts.has(host)) continue;
      seenHosts.add(host);
      out.push({ name: cleanName(item.title || "", host), website: `https://${host}`, sourceUrl: link });
    }
    memCache.set(cacheKey, { at: Date.now(), rows: out });
    return out.slice(0, limit);
  } catch {
    return [];
  }
}
