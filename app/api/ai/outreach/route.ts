import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { consumeQuota, getAuthUser, getUsage, quotaConfigured } from "@/lib/quota";

// AI outreach is a plan feature: it requires a signed-in user and costs
// 1 daily credit (Free: limited, per the pricing page; Pro: fair-use
// pool). Before 2026-10-23 this route had NO auth or quota at all —
// anyone could generate unlimited outreach. Fixed after the owner's
// report that free/anonymous users could use Pro features.
export async function POST(req: Request) {
  if (!(await rateLimit(`ai-outreach:${clientIp(req)}`, 20, 60_000))) {
    return NextResponse.json({ ok: false, error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));

  let quotaUserId: string | null = null;
  if (quotaConfigured()) {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Sign in to generate outreach." }, { status: 401 });
    }
    const usage = await getUsage(user.id);
    if (!usage) return NextResponse.json({ ok: false, error: "Could not check your quota." }, { status: 502 });
    if (usage.remaining <= 0) {
      return NextResponse.json(
        { ok: false, code: "QUOTA_EXCEEDED", error: `Daily limit reached (${usage.limit} leads on the ${usage.plan} plan). Upgrade to Pro for more.` },
        { status: 429 },
      );
    }
    quotaUserId = user.id;
  }
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
              content: "Write one short, personalized, non-spammy B2B outreach email (120 words max) plus a subject line. No fake claims. End with a one-line opt-out (e.g. \"Reply 'unsubscribe' and we'll remove your business from our lists.\").",
            },
            { role: "user", content: `Write outreach to ${company}, a company in ${industry}. Context: ${body.description || ""}` },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const message = data?.choices?.[0]?.message?.content;
        if (message) {
          if (quotaUserId) await consumeQuota(quotaUserId, 1);
          return NextResponse.json({ message, source: "groq" });
        }
      }
    } catch {
      // fall through to template
    }
  }
  if (quotaUserId) await consumeQuota(quotaUserId, 1);
  return NextResponse.json({
    source: "template",
    message: `Subject: Quick idea for ${company}\n\nHi ${company} team,\n\nI work with companies in ${industry} to find and reach their next customers faster using AI-scored lead generation.\n\nWould a short list of qualified prospects for your team be useful this week? Happy to send a few examples first — no commitment.\n\nBest regards\n\nIf you'd rather not hear from us, reply "unsubscribe" and we'll remove your business from our lists.`,
  });
}
