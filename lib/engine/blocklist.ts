import { serviceClient } from "@/lib/quota";
import type { Lead } from "@/lib/types";

// Unsubscribe enforcement (fix for the 2026-10-24 sweep's MEDIUM finding).
// Until this file existed, /api/unsubscribe RECORDED entries but NOTHING
// ever read the table — a recorded business kept appearing in results.
// Now every search and website-extraction response filters against this
// list at RESPONSE time, so cached results are filtered too (a stale
// cache can never resurrect a blocked business).
//
// Matching is by domain and/or email — never by company name alone
// (names collide; domains don't). A lead is blocked when:
//   - its email equals a blocklist email, or
//   - its website domain, or its email's domain, equals a blocklist domain.

export type BlockEntry = { domain: string | null; email: string | null };

let cached: { list: BlockEntry[]; at: number } | null = null;
const TTL_MS = 5 * 60_000;

export function domainOf(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0];
}

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

export async function getBlocklist(): Promise<BlockEntry[]> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.list;
  const admin = serviceClient();
  if (!admin) return cached?.list || [];
  try {
    const { data, error } = await admin.from("unsubscribe_blocklist").select("domain, email").limit(5000);
    if (error) throw error;
    const list = (data || []).map((r) => ({
      domain: (r.domain || "").toLowerCase() || null,
      email: (r.email || "").toLowerCase() || null,
    }));
    cached = { list, at: now };
    return list;
  } catch {
    // A failed refresh must not break search; fall back to the last
    // known list (empty only if we never fetched one).
    return cached?.list || [];
  }
}

export function isBlocked(lead: { website?: string; email?: string }, list: BlockEntry[]): boolean {
  if (!list.length) return false;
  const wdom = lead.website ? domainOf(lead.website) : "";
  const em = (lead.email || "").toLowerCase();
  const edom = em ? emailDomain(em) : "";
  for (const e of list) {
    if (e.email && em && e.email === em) return true;
    if (e.domain && ((wdom && e.domain === wdom) || (edom && e.domain === edom))) return true;
  }
  return false;
}

export function filterBlocked(leads: Lead[], list: BlockEntry[]): Lead[] {
  if (!list.length) return leads;
  return leads.filter((l) => !isBlocked(l, list));
}
