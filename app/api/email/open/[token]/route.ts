import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/quota";
import { fireWebhook } from "@/lib/email/providers";

// 1x1 tracking pixel. First open only counts (update where opened_at
// is null, and only bump the campaign counter when that update lands).
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = serviceClient();
  if (admin && token) {
    const { data: rows } = await admin
      .from("email_recipients")
      .update({ opened_at: new Date().toISOString() })
      .eq("token", token)
      .is("opened_at", null)
      .select("id, campaign_id, user_id, email");
    const row = rows?.[0];
    if (row) {
      const { data: camp } = await admin
        .from("email_campaigns")
        .select("opened")
        .eq("id", row.campaign_id)
        .maybeSingle();
      if (camp) {
        await admin
          .from("email_campaigns")
          .update({ opened: Number(camp.opened || 0) + 1 })
          .eq("id", row.campaign_id);
      }
      const { data: settings } = await admin
        .from("email_settings")
        .select("webhook_url")
        .eq("user_id", row.user_id)
        .maybeSingle();
      await fireWebhook((settings?.webhook_url as string | null) || null, {
        event: "opened",
        campaignId: row.campaign_id,
        email: row.email,
      });
    }
  }
  return new NextResponse(GIF, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
