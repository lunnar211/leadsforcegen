import { NextResponse } from "next/server";
import { sampleLeads, type Lead } from "@/lib/types";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { consumeQuota, getAuthUser, getUsage, quotaConfigured } from "@/lib/quota";
import { searchEverywhere } from "@/lib/engine/search";

export const maxDuration = 60;


async function groqLeads(body: Record<string, string>): Promise<Lead[] | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const model = process.env.AI_MODEL || "llama-3.3-70b-versatile";
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You generate company-level B2B prospect ideas as JSON. Never invent personal phone numbers or personal email addresses of real people. Only return company/business names, industry, location, approximate size, a plausible public website domain placeholder if unknown, a short description, and a fit score 0-100. Return JSON: {\"leads\":[{company,industry,location,size,website,description,score}]}",
          },
          {
            role: "user",
            content: `Generate 10 company prospects. Lead type: ${body.leadType || "B2B companies"}. Industry: ${body.industry || "Any"}. Location: ${body.location || "Any"}. Company size: ${body.size || "Any"}. Keywords: ${body.keywords || "none"}.`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.leads)) return null;
    return parsed.leads.slice(0, 10).map((l: Record<string, unknown>) => ({
      company: String(l.company || "Unknown company"),
      industry: String(l.industry || body.industry || ""),
      location: String(l.location || body.location || ""),
      size: String(l.size || body.size || ""),
      website: String(l.website || ""),
      description: String(l.description || ""),
      score: Math.max(0, Math.min(100, Number(l.score) || 70)),
    }));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
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
  // (3) clearly labeled samples. Any engine failure falls through silently.
  const niche = String(body.industry || body.leadType || "");
  const where = String(body.location || "");
  const want = quotaUser ? quotaUser.remaining : 10;
  const engine = await searchEverywhere(niche, where, Math.min(want, 30));
  if (engine.leads.length > 0) {
    const note = `Found ${engine.leads.length} real businesses from public sources (OpenStreetMap + their own websites, ${engine.pagesRead} pages read). Contacts are published by the businesses — verify before outreach.`;
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

  const ai = await groqLeads(body);
  let leads = ai ?? sampleLeads(body);
  const source = ai ? "groq" : "sample";
  const note = ai
    ? "AI-generated company prospects. Verify every lead before outreach — do not treat AI output as verified contact data."
    : "Sample data (Groq key missing or request failed). Clearly labeled demo leads — verify before outreach.";

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
