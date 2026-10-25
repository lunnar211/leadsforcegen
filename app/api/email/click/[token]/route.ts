import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/quota";
import { fireWebhook } from "@/lib/email/providers";

// Click redirect: count the first click per recipient, fire the user's
// webhook, then send the reader to the real link. Only http(s) targets
// are honored — anything else lands on the homepage.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const raw = new URL(req.url).searchParams.get("u") || "";
  const target = /^https?:\/\//.test(raw) ? raw : "/";
  const admin = serviceClient();
  if (admin && token) {
    const { data: rows } = await admin
      .from("email_recipients")
      .update({ clicked_at: new Date().toISOString() })
      .eq("token", token)
      .is("clicked_at", null)
      .select("id, campaign_id, user_id, email");
    const row = rows?.[0];
    if (row) {
      const { data: camp } = await admin
        .from("email_campaigns")
        .select("clicked")
        .eq("id", row.campaign_id)
        .maybeSingle();
      if (camp) {
        await admin
          .from("email_campaigns")
          .update({ clicked: Number(camp.clicked || 0) + 1 })
          .eq("id", row.campaign_id);
      }
      const { data: settings } = await admin
        .from("email_settings")
        .select("webhook_url")
        .eq("user_id", row.user_id)
        .maybeSingle();
      await fireWebhook((settings?.webhook_url as string | null) || null, {
        event: "clicked",
        campaignId: row.campaign_id,
        email: row.email,
        url: target,
      });
    }
  }
  return NextResponse.redirect(target, 302);
}
