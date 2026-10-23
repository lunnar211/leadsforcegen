import { NextResponse } from "next/server";
import { sampleLeads, type Lead } from "@/lib/types";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { consumeQuota, getAuthUser, getUsage, quotaConfigured } from "@/lib/quota";
import { normalizeNiche, searchEverywhere, type EngineResult } from "@/lib/engine/search";
import { cacheGet, cacheSet } from "@/lib/cache";

export const maxDuration = 60;


async function groqLeads(body: Record<string, string>): Promise<Lead[] | null> {
  const text = await groqGenerate(
    `You generate company-level B2B prospect ideas as JSON. Never invent personal phone numbers or personal email addresses of real people. Only return company/business names, industry, location, approximate size, a plausible public website domain placeholder if unknown, a short description, and a fit score 0-100. ${LEAD_SCHEMA_HINT}\nGenerate 10 company prospects. Lead type: ${body.leadType || "B2B companies"}. Industry: ${body.industry || "Any"}. Location: ${body.location || "Any"}. Company size: ${body.size || "Any"}. Keywords: ${body.keywords || "none"}.`,
    12000,
  );
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.leads)) return null;
    return mapAiLeads(parsed.leads, body);
  } catch {
    return null;
  }
}

const LEAD_SCHEMA_HINT = "Return JSON: {\"leads\":[{company,industry,location,size,website,description,score}]}";

function mapAiLeads(raw: Record<string, unknown>[], body: Record<string, string>): Lead[] {
  return raw.slice(0, 10).map((l) => ({
    company: String(l.company || "Unknown company"),
    industry: String(l.industry || body.industry || ""),
    location: String(l.location || body.location || ""),
    size: String(l.size || body.size || ""),
    website: String(l.website || ""),
    description: String(l.description || ""),
    score: Math.max(0, Math.min(100, Number(l.score) || 70)),
  }));
}

// Gemini — second AI source (when Groq is down/missing) and the default
// filter brain. Same honesty rules as Groq: company-level prospects only,
// never invented personal contacts. GEMINI_API_URL override exists so the
// integration can be tested against a local mock.
async function geminiGenerate(prompt: string, timeoutMs: number): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = process.env.GEMINI_API_URL || `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    return parts.map((p: { text?: string }) => p.text || "").join("");
  } catch {
    return null;
  }
}

async function geminiLeads(body: Record<string, string>): Promise<Lead[] | null> {
  const text = await geminiGenerate(
    `You generate company-level B2B prospect ideas as JSON. Never invent personal phone numbers or personal email addresses of real people. Only return company/business names, industry, location, approximate size, a plausible public website domain placeholder if unknown, a short description, and a fit score 0-100. ${LEAD_SCHEMA_HINT}\nGenerate 10 company prospects. Lead type: ${body.leadType || "B2B companies"}. Industry: ${body.industry || "Any"}. Location: ${body.location || "Any"}. Company size: ${body.size || "Any"}. Keywords: ${body.keywords || "none"}.`,
    12000,
  );
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.leads)) return null;
    return mapAiLeads(parsed.leads, body);
  } catch {
    return null;
  }
}

async function groqGenerate(prompt: string, timeoutMs: number): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const model = process.env.AI_MODEL || "llama-3.3-70b-versatile";
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

// AI FILTER (Gemini first, Groq as backup): re-checks AI-GENERATED leads
// for relevance to the search. It may only DROP or RE-SCORE leads — never
// add companies and never add contact details. Engine (real, published)
// leads are never filtered. Any failure returns the leads unchanged.
async function aiFilter(leads: Lead[], niche: string, location: string): Promise<{ leads: Lead[]; by: string | null }> {
  if (!leads.length) return { leads, by: null };
  const list = leads.map((l) => ({ company: l.company, industry: l.industry, location: l.location, description: l.description }));
  const prompt = `You are a strict relevance filter for B2B lead lists. The user searched for: industry "${niche}", location "${location}". For each company below, decide if it plausibly matches that industry and location. Return JSON: {"verdicts":[{"company": string, "keep": boolean, "score": number 0-100}]}. Rules: keep=false for companies that clearly do not match the industry or are generic/fictional-sounding placeholders; never invent new companies; judge ONLY from the data given.\nCompanies: ${JSON.stringify(list)}`;
  const providers: { name: string; run: (p: string, t: number) => Promise<string | null> }[] = [
    { name: "gemini", run: geminiGenerate },
    { name: "groq", run: groqGenerate },
  ];
  for (const p of providers) {
    const text = await p.run(prompt, 10000);
    if (!text) continue;
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.verdicts)) continue;
      const verdict = new Map<string, { keep: boolean; score: number }>();
      for (const v of parsed.verdicts as Record<string, unknown>[]) {
        verdict.set(String(v.company || "").toLowerCase(), { keep: Boolean(v.keep), score: Math.max(0, Math.min(100, Number(v.score) || 0)) });
      }
      const kept = leads
        .filter((l) => verdict.get(l.company.toLowerCase())?.keep !== false)
        .map((l) => {
          const v = verdict.get(l.company.toLowerCase());
          return v && v.score > 0 ? { ...l, score: v.score } : l;
        })
        .sort((a, b) => b.score - a.score);
      return { leads: kept, by: p.name };
    } catch { /* try the next provider */ }
  }
  return { leads, by: null };
}

export async function POST(req: Request) {
  try {
    return await handlePost(req);
  } catch {
    // Last-resort guard: an unexpected server problem must still answer
    // with JSON the client can show — never a dropped connection.
    return NextResponse.json({ ok: false, error: "Search hit a server problem. Please try again." }, { status: 500 });
  }
}

async function handlePost(req: Request) {
  if (!(await rateLimit(`ai-leads:${clientIp(req)}`, 20, 60_000))) {
    return NextResponse.json({ ok: false, error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));

  // Server-side quota (active when Supabase is configured): the caller's
  // plan and daily limit come from Postgres, never from the client.
  let quotaUser: { id: string; remaining: number } | null = null;
  if (quotaConfigured()) {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Sign in to search for leads." }, { status: 401 });
    }
    const usage = await getUsage(user.id);
    if (!usage) return NextResponse.json({ ok: false, error: "Could not check your quota." }, { status: 502 });
    if (usage.remaining <= 0) {
      return NextResponse.json(
        { ok: false, code: "QUOTA_EXCEEDED", error: `Daily limit reached (${usage.limit} leads on the ${usage.plan} plan). Upgrade to Pro for more.` },
        { status: 429 },
      );
    }
    quotaUser = { id: user.id, remaining: usage.remaining };
  }

  // Source order: (1) Search Everywhere engine — real businesses from
  // public sources with published contacts; (2) Groq AI prospects;
  // (3) Gemini AI prospects; (4) clearly labeled samples. AI prospects are
  // relevance-filtered by the other AI. Any failure falls through silently.
  const niche = String(body.industry || body.leadType || "");
  const where = String(body.location || "");
  const want = quotaUser ? quotaUser.remaining : 10;
  // Whole-search cache (6h): the same niche+city search is the most
  // common repeat request — a hit answers in well under a second instead
  // of re-running the map query and website crawl. Quota still applies.
  const limitWanted = Math.min(want, 30);
  const searchKey = `search:v4:${normalizeNiche(niche)}|${where.toLowerCase().trim()}|${limitWanted}`;
  let engine = await cacheGet<EngineResult>(searchKey, 6 * 3600_000);
  const fromCache = Boolean(engine);
  if (!engine) {
    engine = await searchEverywhere(niche, where, limitWanted);
    if (engine.leads.length > 0) void cacheSet(searchKey, engine);
  }
  if (engine.leads.length > 0) {
    const withEmail = engine.leads.filter((l) => l.email).length;
    const withPhone = engine.leads.filter((l) => l.phone).length;
    const note = `Found ${engine.leads.length} real businesses from public sources (OpenStreetMap + their own websites${fromCache ? "; served from the results cache, refreshed every few hours" : `, ${engine.pagesRead} pages read`}). Contact coverage: ${withEmail}/${engine.leads.length} publish an email, ${withPhone}/${engine.leads.length} publish a phone — businesses that don't publish contacts still show their website and map source. Verify before outreach.`;
    if (quotaUser) {
      const consumed = await consumeQuota(quotaUser.id, engine.leads.length);
      if (!consumed) {
        return NextResponse.json({ ok: false, code: "QUOTA_EXCEEDED", error: "Daily limit reached. Upgrade to Pro for more." }, { status: 429 });
      }
      const usage = await getUsage(quotaUser.id);
      return NextResponse.json({ ok: true, leads: engine.leads, source: "search-everywhere", note, usage });
    }
    return NextResponse.json({ leads: engine.leads, source: "search-everywhere", note });
  }

  // AI chain: Groq first, Gemini second, samples last. AI leads then go
  // through the AI filter (Gemini, Groq backup) which drops off-topic
  // results and re-scores the rest — it never adds data.
  let ai = await groqLeads(body);
  let aiSource = "groq";
  if (!ai) {
    ai = await geminiLeads(body);
    aiSource = "gemini";
  }
  let leads: Lead[];
  let source: string;
  let note: string;
  if (ai) {
    const filtered = await aiFilter(ai, niche, where);
    leads = filtered.leads;
    source = filtered.by ? `${aiSource}+${filtered.by}-filter` : aiSource;
    note = `AI-generated company prospects (${aiSource}${filtered.by ? `, relevance-filtered by ${filtered.by}` : ""}). Verify every lead before outreach — do not treat AI output as verified contact data.`;
  } else {
    leads = sampleLeads(body);
    source = "sample";
    note = "Sample data (AI providers unavailable). Clearly labeled demo leads — verify before outreach.";
  }

  if (quotaUser) {
    leads = leads.slice(0, quotaUser.remaining);
    const consumed = await consumeQuota(quotaUser.id, leads.length);
    if (!consumed) {
      return NextResponse.json(
        { ok: false, code: "QUOTA_EXCEEDED", error: "Daily limit reached. Upgrade to Pro for more." },
        { status: 429 },
      );
    }
    const usage = await getUsage(quotaUser.id);
    return NextResponse.json({ ok: true, leads, source, note, usage });
  }
  return NextResponse.json({ leads, source, note });
}
