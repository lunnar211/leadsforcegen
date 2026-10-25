import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/quota";
import { fireWebhook } from "@/lib/email/providers";

// One-click unsubscribe from a bulk mail. Marks the recipient, bumps
// the campaign counter, and records ONLY the email address (never the
// whole domain — blocking a domain would nuke every gmail.com-style
// address) on the shared unsubscribe blocklist, so the address is never
// mailed again by this panel or shown in lead results.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = serviceClient();
  let email = "";
  if (admin && token) {
    const { data: rows } = await admin
      .from("email_recipients")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("token", token)
      .is("unsubscribed_at", null)
      .select("id, campaign_id, user_id, email");
    const row = rows?.[0];
    if (row) {
      email = row.email as string;
      const { data: camp } = await admin
        .from("email_campaigns")
        .select("unsubscribed")
        .eq("id", row.campaign_id)
        .maybeSingle();
      if (camp) {
        await admin
          .from("email_campaigns")
          .update({ unsubscribed: Number(camp.unsubscribed || 0) + 1 })
          .eq("id", row.campaign_id);
      }
      const { data: existing } = await admin
        .from("unsubscribe_blocklist")
        .select("id")
        .eq("email", email.toLowerCase())
        .limit(1);
      if (!existing?.length) {
        await admin.from("unsubscribe_blocklist").insert({ email: email.toLowerCase() });
      }
      const { data: settings } = await admin
        .from("email_settings")
        .select("webhook_url")
        .eq("user_id", row.user_id)
        .maybeSingle();
      await fireWebhook((settings?.webhook_url as string | null) || null, {
        event: "unsubscribed",
        campaignId: row.campaign_id,
        email,
      });
    }
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head><body style="font-family:Arial,sans-serif;max-width:560px;margin:64px auto;padding:0 16px;text-align:center"><h1>You've been unsubscribed</h1><p>${email ? `You (${email}) will not receive further emails from this sender.` : "You will not receive further emails from this sender."}</p></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
