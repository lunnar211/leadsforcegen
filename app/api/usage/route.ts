import { NextResponse } from "next/server";
import { FREE_DAILY_LEAD_LIMIT } from "@/lib/types";
import { getAuthUser, getUsage, quotaConfigured } from "@/lib/quota";

import { connection } from "next/server";

// The dashboard reads plan/usage ONLY from here. When Supabase is not
// configured the response says so and the UI labels itself demo mode.
export async function GET(req: Request) {
  await connection();
  if (!quotaConfigured()) {
    return NextResponse.json({
      ok: true,
      data: { configured: false, plan: "free", used: 0, limit: FREE_DAILY_LEAD_LIMIT, remaining: FREE_DAILY_LEAD_LIMIT },
    });
  }
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to see your usage." }, { status: 401 });
  }
  const usage = await getUsage(user.id);
  if (!usage) {
    return NextResponse.json({ ok: false, error: "Could not load usage." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, data: { configured: true, email: user.email, ...usage } });
}
