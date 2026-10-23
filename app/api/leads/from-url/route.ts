import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { consumeQuota, getAuthUser, getUsage, quotaConfigured } from "@/lib/quota";
import { leadFromWebsite } from "@/lib/engine/site";

// One-click website extraction: paste a business website, get the lead
// that business publishes on its own pages. Same auth + server-side
// quota rules as the main search (1 credit, charged only on success).
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    if (!(await rateLimit(`from-url:${clientIp(req)}`, 20, 60_000))) {
      return NextResponse.json({ ok: false, error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    const target = String(body.url || "").trim();
    if (!target) {
      return NextResponse.json({ ok: false, error: "Enter a website address first." }, { status: 400 });
    }

    let userId: string | null = null;
    if (quotaConfigured()) {
      const user = await getAuthUser(req);
      if (!user) {
        return NextResponse.json({ ok: false, error: "Sign in to extract leads." }, { status: 401 });
      }
      const usage = await getUsage(user.id);
      if (!usage) return NextResponse.json({ ok: false, error: "Could not check your quota." }, { status: 502 });
      if (usage.remaining <= 0) {
        return NextResponse.json(
          { ok: false, code: "QUOTA_EXCEEDED", error: `Daily limit reached (${usage.limit} leads on the ${usage.plan} plan). Upgrade to Pro for more.` },
          { status: 429 },
        );
      }
      userId = user.id;
    }

    const { lead, reason } = await leadFromWebsite(target);
    if (!lead) {
      return NextResponse.json({ ok: false, error: reason || "No lead could be extracted from that website." }, { status: 422 });
    }

    if (userId) {
      const consumed = await consumeQuota(userId, 1);
      if (!consumed) {
        return NextResponse.json({ ok: false, code: "QUOTA_EXCEEDED", error: "Daily limit reached. Upgrade to Pro for more." }, { status: 429 });
      }
      const usage = await getUsage(userId);
      return NextResponse.json({ ok: true, leads: [lead], source: "website", note: "Extracted from the business's own website. Verify before outreach.", usage });
    }
    return NextResponse.json({ ok: true, leads: [lead], source: "website", note: "Extracted from the business's own website. Verify before outreach." });
  } catch {
    return NextResponse.json({ ok: false, error: "Extraction hit a server problem. Please try again." }, { status: 500 });
  }
}
