import { cookies } from "next/headers";
import { connection } from "next/server";
import { ADMIN_COOKIE, verifyAdminSessionToken } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/quota";

// Owner-only pipeline diagnostics: runs every stage of the lead pipeline
// LIVE from this server and reports status + timing per stage — no
// secrets, only whether each key/source answers. This is how "the search
// returned samples" gets traced to the exact failing stage.
export const maxDuration = 60;

const UA = "LeadForge/1.0 (leadsforcegen.vercel.app)";

type Stage = { stage: string; ok: boolean; ms: number; detail: string };

async function timed(stage: string, run: () => Promise<string>): Promise<Stage> {
  const t0 = Date.now();
  try {
    const detail = await run();
    return { stage, ok: true, ms: Date.now() - t0, detail };
  } catch (e) {
    return { stage, ok: false, ms: Date.now() - t0, detail: e instanceof Error ? e.message.slice(0, 160) : "error" };
  }
}

export async function GET() {
  await connection();
  const store = await cookies();
  if (!verifyAdminSessionToken(store.get(ADMIN_COOKIE)?.value)) {
    return Response.json({ ok: false, error: "Owner sign-in required." }, { status: 403 });
  }

  const stages: Stage[] = [];

  stages.push(await timed("geocode (Nominatim)", async () => {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent("Dubai")}`, {
      headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => [])) as unknown[];
    return `HTTP ${res.status}, ${Array.isArray(data) ? data.length : 0} result(s)`;
  }));

  const ql = `[out:json][timeout:15];(nwr["amenity"="dentist"](around:20000,25.2048,55.2708););out center 5;`;
  for (const mirror of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]) {
    stages.push(await timed(`overpass (${new URL(mirror).hostname})`, async () => {
      const res = await fetch(mirror, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ data: ql }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => null)) as { elements?: unknown[] } | null;
      return `HTTP ${res.status}, ${data?.elements ? data.elements.length : 0} element(s)`;
    }));
  }

  stages.push(await timed("groq key", async () => {
    if (!process.env.GROQ_API_KEY) return "not set";
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, signal: AbortSignal.timeout(8000),
    });
    return `HTTP ${res.status}${res.status === 200 ? " (key valid)" : res.status === 401 ? " (key REJECTED — revoked or wrong)" : ""}`;
  }));

  stages.push(await timed("gemini key", async () => {
    if (!process.env.GEMINI_API_KEY) return "not set";
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash", {
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(8000),
    });
    return `HTTP ${res.status}${res.status === 200 ? " (key valid)" : res.status === 400 || res.status === 403 ? " (key REJECTED — revoked or wrong)" : ""}`;
  }));

  stages.push(await timed("supabase search_cache", async () => {
    const sb = serviceClient();
    if (!sb) return "service client not configured";
    const { error } = await sb.from("search_cache").select("cache_key").limit(1);
    return error ? `error: ${error.message.slice(0, 120)}` : "table reachable";
  }));

  return Response.json({ ok: true, at: new Date().toISOString(), stages });
}
