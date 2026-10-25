import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/quota";
import { requireProUser, loadSettings } from "@/lib/email/guard";
import { decryptSecret, hashToken } from "@/lib/email/crypto";
import { extractEmails } from "@/lib/email/extract";
import { buildHtml, rewriteLinks, sendOne, fireWebhook, type Attachment, type ProviderCreds } from "@/lib/email/providers";
import { getBlocklist, isBlocked } from "@/lib/engine/blocklist";

// Caps that keep a campaign inside one serverless invocation and inside
// a free provider tier (Brevo free = 300/day): 50 recipients per send
// call, 300 sent per user per day, 3 attachments totaling 2 MB raw
// (serverless request bodies cap near 4.5 MB once base64-inflated).
const PER_SEND_CAP = 50;
const DAILY_CAP = 300;
const MAX_ATTACH_BYTES = 2 * 1024 * 1024;
const SEND_DEADLINE_MS = 50_000;

export async function POST(req: Request) {
  const t0 = Date.now();
  const auth = await requireProUser(req);
  if ("status" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Email is not configured on the server." }, { status: 502 });

  const settings = await loadSettings(auth.user.id);
  if (!settings) {
    return NextResponse.json({ ok: false, error: "Connect a provider first (Bulk Email → Settings)." }, { status: 400 });
  }
  let creds: ProviderCreds;
  try {
    const raw = JSON.parse(decryptSecret(settings.creds as string)) as Record<string, unknown>;
    if (settings.provider === "brevo" || settings.provider === "resend") {
      creds = { provider: settings.provider, apiKey: String(raw.apiKey || "") };
    } else {
      creds = {
        provider: "smtp",
        host: String(raw.host || ""),
        port: Number(raw.port || 587),
        secure: Boolean(raw.secure),
        user: String(raw.user || ""),
        pass: String(raw.pass || ""),
      };
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Saved provider credentials could not be read. Re-save them in Settings." }, { status: 502 });
  }

  const body = await req.json().catch(() => ({}));
  let campaignId = String(body.campaignId || "");
  let queued: { id: string; email: string; token: string }[] = [];

  if (campaignId) {
    // Resume: only recipients still queued for this user's campaign.
    const { data: camp } = await admin
      .from("email_campaigns")
      .select("id, subject, template")
      .eq("id", campaignId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!camp) return NextResponse.json({ ok: false, error: "Campaign not found." }, { status: 404 });
    const { data: rows } = await admin
      .from("email_recipients")
      .select("id, email, token")
      .eq("campaign_id", campaignId)
      .eq("status", "queued");
    queued = (rows || []) as typeof queued;
    // Resume reuses the campaign's stored subject/template via the
    // campaign row; the body is re-supplied by the client.
    (body as Record<string, unknown>).subject = camp.subject;
    (body as Record<string, unknown>).template = camp.template;
  } else {
    const subject = String(body.subject || "").trim().slice(0, 200);
    const template = ["simple", "announcement", "offer"].includes(String(body.template)) ? String(body.template) : "simple";
    const bodyHtml = String(body.bodyHtml || "").slice(0, 100_000);
    if (!subject || !bodyHtml) {
      return NextResponse.json({ ok: false, error: "Subject and message are required." }, { status: 400 });
    }
    const rawList = Array.isArray(body.recipients) ? body.recipients.join("\n") : String(body.recipients || "");
    let emails = extractEmails(rawList).slice(0, PER_SEND_CAP);
    if (!emails.length) {
      return NextResponse.json({ ok: false, error: "No valid email addresses in the list." }, { status: 400 });
    }
    // Attachments: at most 3 files, 2 MB raw total (validated here for
    // new campaigns; the same validation runs for resumes below).
    const newAttachments: Attachment[] = Array.isArray(body.attachments) ? body.attachments.slice(0, 3) : [];
    let attachBytes = 0;
    for (const a of newAttachments) {
      const content = String(a?.content || "");
      attachBytes += Math.floor((content.length * 3) / 4);
      if (attachBytes > MAX_ATTACH_BYTES) {
        return NextResponse.json({ ok: false, error: "Attachments total over 2 MB." }, { status: 400 });
      }
    }
    // Never send to a business/person that unsubscribed, even if the
    // user pasted them again.
    const blocklist = await getBlocklist();
    const blocked: string[] = [];
    const sendable: string[] = [];
    for (const email of emails) {
      if (isBlocked({ email }, blocklist)) blocked.push(email);
      else sendable.push(email);
    }
    emails = sendable;
    const { data: camp } = await admin
      .from("email_campaigns")
      .insert({ user_id: auth.user.id, subject, template, status: "sending", total: emails.length + blocked.length })
      .select("id")
      .single();
    if (!camp) return NextResponse.json({ ok: false, error: "Could not create the campaign." }, { status: 502 });
    campaignId = camp.id as string;
    const rows = emails.map((email) => ({
      campaign_id: campaignId,
      user_id: auth.user.id,
      email,
      token: hashToken(),
      status: "queued",
    }));
    const blockedRows = blocked.map((email) => ({
      campaign_id: campaignId,
      user_id: auth.user.id,
      email,
      token: hashToken(),
      status: "blocked",
    }));
    if (rows.length) await admin.from("email_recipients").insert(rows);
    if (blockedRows.length) await admin.from("email_recipients").insert(blockedRows);
    queued = rows.map((r) => ({ id: "", email: r.email, token: r.token }));
    // The body is deliberately NOT persisted on the campaign row
    // (bodies + attachments can be large); resume re-supplies them.
  }

  // Daily cap: sent today by this user.
  const today = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
  const { count: sentToday } = await admin
    .from("email_recipients")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id)
    .eq("status", "sent")
    .gte("created_at", today);
  const budget = Math.max(0, DAILY_CAP - (sentToday || 0));
  // Attachments come from the request on both paths (new + resume).
  const attachments: Attachment[] = Array.isArray(body.attachments) ? (body.attachments as Attachment[]).slice(0, 3) : [];
  {
    let total = 0;
    for (const a of attachments) total += Math.floor((String(a?.content || "").length * 3) / 4);
    if (total > MAX_ATTACH_BYTES) {
      return NextResponse.json({ ok: false, error: "Attachments total over 2 MB." }, { status: 400 });
    }
  }
  const subject = String(body.subject || "");
  const template = String(body.template || "simple");
  const bodyHtml = String(body.bodyHtml || "");
  const text = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  // Re-read queued rows with ids (the insert above didn't return them
  // for the new-campaign path when rows were built client-side).
  if (!queued.length || !queued[0].id) {
    const { data: rows } = await admin
      .from("email_recipients")
      .select("id, email, token")
      .eq("campaign_id", campaignId)
      .eq("status", "queued")
      .order("created_at", { ascending: true });
    queued = (rows || []) as typeof queued;
  }

  let sent = 0;
  let failed = 0;
  const sendOneTo = async (r: { id: string; email: string; token: string }) => {
    const html = rewriteLinks(buildHtml({ template, bodyHtml, token: r.token, senderName: settings.senderName }), r.token);
    try {
      await sendOne(creds, {
        fromName: settings.senderName,
        fromEmail: settings.senderEmail,
        to: r.email,
        subject,
        html,
        text,
        attachments,
      });
      await admin.from("email_recipients").update({ status: "sent" }).eq("id", r.id);
      sent += 1;
      void fireWebhook(settings.webhookUrl, { event: "sent", campaignId, email: r.email });
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 300) : "Send failed";
      await admin.from("email_recipients").update({ status: "failed", error: msg }).eq("id", r.id);
      failed += 1;
      void fireWebhook(settings.webhookUrl, { event: "failed", campaignId, email: r.email, error: msg });
    }
  };

  // Concurrency 5, hard stop at the deadline: anything unsent stays
  // queued and the panel offers Resume (which sends only queued rows).
  const todo = queued.slice(0, budget);
  for (let i = 0; i < todo.length; i += 5) {
    if (Date.now() - t0 > SEND_DEADLINE_MS) break;
    const batch = todo.slice(i, i + 5);
    await Promise.all(batch.map(sendOneTo));
    if (Date.now() - t0 > SEND_DEADLINE_MS) break;
  }
  const remaining = todo.length - sent - failed;
  const { data: counts } = await admin.from("email_recipients").select("status").eq("campaign_id", campaignId);
  const byStatus = (s: string) => (counts || []).filter((r) => r.status === s).length;
  await admin
    .from("email_campaigns")
    .update({
      status: byStatus("queued") > 0 ? "partial" : "done",
      sent: byStatus("sent"),
      failed: byStatus("failed"),
    })
    .eq("id", campaignId);
  return NextResponse.json({
    ok: true,
    data: {
      campaignId,
      sent,
      failed,
      queued: byStatus("queued"),
      blocked: byStatus("blocked"),
      deadlineHit: remaining > 0,
    },
  });
}
