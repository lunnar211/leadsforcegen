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
    // Same strip as the list branch: the encrypted body never leaves
    // the server (manual Resume re-supplies the body from the client).
    const safeCamp = { ...(camp as Record<string, unknown>) };
    delete safeCamp.body_enc;
    const { data: recipients } = await admin
      .from("email_recipients")
      .select("email, status, opened_at, clicked_at, unsubscribed_at, error")
      .eq("campaign_id", id)
      .order("created_at", { ascending: true })
      .limit(500);
    return NextResponse.json({ ok: true, data: { campaign: safeCamp, recipients: recipients || [] } });
  }
  const { data: campaigns } = await admin
    .from("email_campaigns")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  // Never return the auto-drain encrypted body to the client: the
  // panel never needs it (manual Resume re-supplies the body from the
  // compose box). Pre-migration rows simply lack the column, and the
  // strip below is a no-op for them.
  const safe = (campaigns || []).map((c) => {
    const row = { ...(c as Record<string, unknown>) };
    delete row.body_enc;
    return row;
  });
  return NextResponse.json({ ok: true, data: safe });
}

export async function POST(req: Request) {
  const auth = await requireProUser(req);
  if ("status" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Email is not configured on the server." }, { status: 502 });
  const body = await req.json().catch(() => ({}));
  if (body.action !== "stop" || typeof body.campaignId !== "string") {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }
  // Stop auto-drain: the campaign keeps its queued rows (manual Resume
  // still works with a client-supplied body), but the cron will never
  // pick it up again and the stored body is wiped immediately.
  const { data, error } = await admin
    .from("email_campaigns")
    .update({ auto_drain: false, body_enc: null })
    .eq("id", body.campaignId)
    .eq("user_id", auth.user.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Could not stop auto-drain." }, { status: 502 });
  if (!data) return NextResponse.json({ ok: false, error: "Campaign not found." }, { status: 404 });
  return NextResponse.json({ ok: true, data: { stopped: true } });
}
