import { NextResponse } from "next/server";
import { normalizeNiche, searchEverywhere } from "@/lib/engine/search";
import { cacheSet } from "@/lib/cache";

// Search-cache warmer — the n8n "make the website faster" hook.
// An external scheduler (n8n nightly workflow) POSTs here with the
// shared secret; the route runs the most common searches through the
// real engine and stores them in the same 6h search cache the leads
// API reads, so the first customer of the day gets instant results
// instead of waiting on a cold engine run. Secret-guarded: without
// the exact x-warm-secret header this route does nothing.
export const maxDuration = 60;

const DEFAULT_SEARCHES: { niche: string; location: string; limit: number }[] = [
  { niche: "dentist", location: "Dubai", limit: 30 },
  { niche: "restaurant", location: "Kathmandu", limit: 30 },
  { niche: "restaurant", location: "Dubai", limit: 30 },
  { niche: "cafe", location: "Dubai", limit: 30 },
  { niche: "hotel", location: "Kathmandu", limit: 30 },
  { niche: "dentist", location: "Kathmandu", limit: 30 },
  { niche: "pharmacy", location: "Dubai", limit: 30 },
  { niche: "salon", location: "Dubai", limit: 30 },
];

export async function POST(req: Request) {
  const secret = process.env.WARM_SECRET || "";
  const given = req.headers.get("x-warm-secret") || "";
  if (!secret || given !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    searches?: { niche?: string; location?: string; limit?: number }[];
  };
  const list = (body.searches?.length ? body.searches : DEFAULT_SEARCHES)
    .map((s) => ({
      niche: String(s.niche || "").trim(),
      location: String(s.location || "").trim(),
      limit: Math.max(1, Math.min(500, Number(s.limit) || 30)),
    }))
    .filter((s) => s.niche && s.location)
    .slice(0, 12);

  const started = Date.now();
  const warmed: { niche: string; location: string; leads: number }[] = [];
  for (const s of list) {
    // Stay inside the serverless budget: stop starting new searches
    // once ~50s are gone; warmed entries are already saved.
    if (Date.now() - started > 50_000) break;
    try {
      const engine = await searchEverywhere(s.niche, s.location, s.limit);
      if (engine.leads.length > 0) {
        const key = `search:v5:${normalizeNiche(s.niche)}|${s.location.toLowerCase().trim()}|${s.limit}`;
        await cacheSet(key, engine);
        warmed.push({ niche: s.niche, location: s.location, leads: engine.leads.length });
      }
    } catch {
      // One bad search never blocks the rest of the warm list.
    }
  }
  return NextResponse.json({ ok: true, warmed, ms: Date.now() - started });
}
