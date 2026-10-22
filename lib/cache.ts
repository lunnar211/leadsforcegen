import "server-only";
import { serviceClient } from "@/lib/quota";

// Two-layer cache for the lead engine: an in-memory Map (fast, per warm
// serverless instance) in front of a Supabase `search_cache` table (shared
// across instances, survives deploys). Every operation is best-effort —
// a cache failure is simply a miss, never an error. The table is
// service-role only (RLS on, no client policies): cache contents are
// server-internal and contain only public business data.
const mem = new Map<string, { at: number; value: unknown }>();
const MEM_TTL_MS = 10 * 60_000;
const MEM_MAX = 500;

export async function cacheGet<T>(key: string, dbTtlMs: number): Promise<T | null> {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < Math.min(MEM_TTL_MS, dbTtlMs)) return hit.value as T;
  const sb = serviceClient();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from("search_cache")
      .select("payload, created_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (!data) return null;
    if (Date.now() - new Date(data.created_at as string).getTime() > dbTtlMs) return null;
    memSet(key, data.payload);
    return data.payload as T;
  } catch {
    return null;
  }
}

function memSet(key: string, value: unknown): void {
  if (mem.size >= MEM_MAX) mem.clear();
  mem.set(key, { at: Date.now(), value });
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  memSet(key, value);
  const sb = serviceClient();
  if (!sb) return;
  try {
    await sb
      .from("search_cache")
      .upsert(
        { cache_key: key, payload: value, created_at: new Date().toISOString() },
        { onConflict: "cache_key" },
      );
  } catch {
    /* best effort — a failed cache write changes nothing for the user */
  }
}
