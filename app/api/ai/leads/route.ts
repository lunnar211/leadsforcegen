import { NextResponse } from "next/server";
import { sampleLeads, type Lead } from "@/lib/types";


async function groqLeads(body: Record<string, string>): Promise<Lead[] | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const model = process.env.AI_MODEL || "llama-3.3-70b-versatile";
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
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
  const body = await req.json().catch(() => ({}));
  const ai = await groqLeads(body);
  if (ai) {
    return NextResponse.json({
      leads: ai,
      source: "groq",
      note: "AI-generated company prospects. Verify every lead before outreach — do not treat AI output as verified contact data.",
    });
  }
  return NextResponse.json({
    leads: sampleLeads(body),
    source: "sample",
    note: "Sample data (Groq key missing or request failed). Clearly labeled demo leads — verify before outreach.",
  });
}
