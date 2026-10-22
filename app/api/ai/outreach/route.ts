import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  if (!(await rateLimit(`ai-outreach:${clientIp(req)}`, 20, 60_000))) {
    return NextResponse.json({ ok: false, error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const company = String(body.company || "your company");
  const industry = String(body.industry || "your industry");
  const key = process.env.GROQ_API_KEY;
  if (key) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: "Write one short, personalized, non-spammy B2B outreach email (120 words max) plus a subject line. No fake claims.",
            },
            { role: "user", content: `Write outreach to ${company}, a company in ${industry}. Context: ${body.description || ""}` },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const message = data?.choices?.[0]?.message?.content;
        if (message) return NextResponse.json({ message, source: "groq" });
      }
    } catch {
      // fall through to template
    }
  }
  return NextResponse.json({
    source: "sample",
    message: `Subject: Quick idea for ${company}\n\nHi ${company} team,\n\nI work with companies in ${industry} to find and reach their next customers faster using AI-scored lead generation.\n\nWould a short list of qualified prospects for your team be useful this week? Happy to send a few examples first — no commitment.\n\nBest regards`,
  });
}
