import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/quota";
import { requireProUser } from "@/lib/email/guard";

// List the user's campaigns, or one campaign with its per-recipient
// open/click status (the panel's "who saw it, who clicked it" view).
export async function GET(req: Request) {
  const auth = await requireProUser(req);
  if ("status" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Email is not configured on the server." }, { status: 502 });
  const id = new URL(req.url).searchParams.get("campaignId");
  if (id) {
    const { data: camp } = await admin
      .from("email_campaigns")
      .select("*")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!camp) return NextResponse.json({ ok: false, error: "Campaign not found." }, { status: 404 });
    const { data: recipients } = await admin
      .from("email_recipients")
      .select("email, status, opened_at, clicked_at, unsubscribed_at, error")
      .eq("campaign_id", id)
      .order("created_at", { ascending: true })
      .limit(500);
    return NextResponse.json({ ok: true, data: { campaign: camp, recipients: recipients || [] } });
  }
  const { data: campaigns } = await admin
    .from("email_campaigns")
    .select("id, subject, template, status, total, sent, failed, opened, clicked, unsubscribed, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ ok: true, data: campaigns || [] });
}
