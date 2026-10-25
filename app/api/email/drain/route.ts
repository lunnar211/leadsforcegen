import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { serviceClient, getUsage } from "@/lib/quota";
import { loadSettings, decryptCreds } from "@/lib/email/guard";
import { decryptSecret } from "@/lib/email/crypto";
import { buildHtml, rewriteLinks, sendOne, fireWebhook, type ProviderCreds } from "@/lib/email/providers";
import { getBlocklist, isBlocked } from "@/lib/engine/blocklist";

// Campaign auto-drain, run by a daily Vercel cron (see vercel.json).
// It sends the queued recipients of opted-in campaigns up to each
// user's provider daily cap, then stops — the next day's run continues
// where this one left off. This RESPECTS daily caps; it never exceeds
// them and never touches campaigns the user did not opt in.
//
// Authorization: Vercel cron requests carry `Authorization: Bearer
// <CRON_SECRET>` automatically when the CRON_SECRET env var is set on
// the project. No user session is involved, so this route keeps its
// logic minimal and reuses the send route's guards (same caps, same
// blocklist check, same tracking, same per-recipient status updates).
// If CRON_SECRET is unset the route fails closed and sends nothing.
//
// Bounds (same shape as the manual send route): concurrency 5, a hard
// 50s deadline for the whole run (hobby serverless is 60s) — anything
// unsent stays queued for the next day's run. A failure for one
// campaign or user never blocks the others; failed campaigns stay
// available for manual Resume with a client-supplied body.
export const maxDuration = 60;

const DAILY_CAPS: Record<string, number> = { brevo: 300, resend: 100, smtp: 500 };
const DRAIN_DEADLINE_MS = 50_000;

type QueuedRow = { id: string; email: string; token: string };
type CampaignRow = {
  id: string;
  user_id: string;
  subject: string;
  template: string;
  status: string;
  body_enc: string | null;
};

function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  // Compare hashes so the check is not sensitive to header length.
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const t0 = Date.now();
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Cron is not configured (CRON_SECRET missing)." }, { status: 503 });
  }
  if (!cronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Email is not configured on the server." }, { status: 502 });

  const { data: campaigns, error: campErr } = await admin
    .from("email_campaigns")
    .select("id, user_id, subject, template, status, body_enc")
    .eq("auto_drain", true)
    .in("status", ["sending", "partial"])
    .order("created_at", { ascending: true });
  if (campErr || !campaigns) {
    // The usual cause is the auto-drain migration not applied yet.
    return NextResponse.json(
      { ok: false, error: "Auto-drain is not enabled yet — apply supabase/email-autodrain.sql first." },
      { status: 502 },
    );
  }

  const blocklist = await getBlocklist();
  const todayStart = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
  // Remaining daily budget per user for this run (shared across that
  // user's campaigns, and decremented as this run sends).
  const remaining = new Map<string, number>();
  const results: Record<string, unknown>[] = [];

  async function budgetFor(userId: string, provider: string): Promise<number> {
    if (!remaining.has(userId)) {
      // Same counting as the manual send route: recipients sent today
      // by this user (created_at-based, matching send-route semantics).
      // Local alias: TS cannot narrow the outer `admin` inside a
      // closure, and the null case is already returned above.
      const db = admin;
      if (!db) return DAILY_CAPS[provider] ?? 300;
      const { count } = await db
        .from("email_recipients")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "sent")
        .gte("created_at", todayStart);
      remaining.set(userId, Math.max(0, (DAILY_CAPS[provider] ?? 300) - (count || 0)));
    }
    return remaining.get(userId) || 0;
  }

  for (const camp of campaigns as CampaignRow[]) {
    if (Date.now() - t0 > DRAIN_DEADLINE_MS) {
      results.push({ campaignId: camp.id, skipped: "deadline" });
      continue;
    }
    if (!camp.body_enc) {
      results.push({ campaignId: camp.id, skipped: "no stored body (manual Resume still works)" });
      continue;
    }
    const usage = await getUsage(camp.user_id);
    if (!usage || usage.plan !== "pro") {
      results.push({ campaignId: camp.id, skipped: "user is not Pro (queued rows kept)" });
      continue;
    }
    const settings = await loadSettings(camp.user_id);
    if (!settings) {
      results.push({ campaignId: camp.id, error: "no provider settings (queued rows kept)" });
      continue;
    }
    // Platform sender never auto-drains: such campaigns cannot be
    // created (the send route refuses auto-drain for platform), so this
    // is defense-in-depth. Skip with a clear reason and keep the queued
    // rows for manual Resume — never let the platform marker fall
    // through to the SMTP credential shape below.
    let drainIsPlatform = false;
    try {
      const marker = JSON.parse(decryptSecret(settings.creds as string)) as Record<string, unknown>;
      drainIsPlatform = marker.platform === true;
    } catch {
      // Fall through to decryptCreds, which fails closed per campaign.
    }
    if (drainIsPlatform) {
      results.push({ campaignId: camp.id, skipped: "platform sender does not support auto-drain (use manual Resume)" });
      continue;
    }
    let creds: ProviderCreds;
    let bodyHtml: string;
    try {
      creds = decryptCreds(settings);
      bodyHtml = decryptSecret(camp.body_enc);
    } catch {
      results.push({ campaignId: camp.id, error: "stored credentials/body unreadable (queued rows kept, manual Resume still works)" });
      continue;
    }
    const text = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const { data: rows } = await admin
      .from("email_recipients")
      .select("id, email, token")
      .eq("campaign_id", camp.id)
      .eq("status", "queued")
      .order("created_at", { ascending: true });
    const queued = (rows || []) as QueuedRow[];

    // Never send to an address that unsubscribed after queueing, even
    // if it was sendable when the campaign was composed.
    const sendable: QueuedRow[] = [];
    for (const r of queued) {
      if (isBlocked({ email: r.email }, blocklist)) {
        await admin.from("email_recipients").update({ status: "blocked" }).eq("id", r.id);
      } else {
        sendable.push(r);
      }
    }

    let sent = 0;
    let failed = 0;
    let budget = await budgetFor(camp.user_id, settings.provider);
    const todo = sendable.slice(0, budget);
    const sendOneTo = async (r: QueuedRow) => {
      const html = rewriteLinks(buildHtml({ template: camp.template, bodyHtml, token: r.token, senderName: settings.senderName }), r.token);
      try {
        await sendOne(creds, {
          fromName: settings.senderName,
          fromEmail: settings.senderEmail,
          to: r.email,
          subject: camp.subject,
          html,
          text,
          attachments: [],
        });
        await admin.from("email_recipients").update({ status: "sent" }).eq("id", r.id);
        sent += 1;
        remaining.set(camp.user_id, Math.max(0, (remaining.get(camp.user_id) || 0) - 1));
        void fireWebhook(settings.webhookUrl, { event: "sent", campaignId: camp.id, email: r.email });
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 300) : "Send failed";
        await admin.from("email_recipients").update({ status: "failed", error: msg }).eq("id", r.id);
        failed += 1;
        void fireWebhook(settings.webhookUrl, { event: "failed", campaignId: camp.id, email: r.email, error: msg });
      }
    };
    for (let i = 0; i < todo.length; i += 5) {
      if (Date.now() - t0 > DRAIN_DEADLINE_MS) break;
      budget = await budgetFor(camp.user_id, settings.provider);
      if (budget <= 0) break;
      const batch = todo.slice(i, i + 5).filter(() => (remaining.get(camp.user_id) || 0) > 0);
      if (!batch.length) break;
      await Promise.all(batch.map(sendOneTo));
    }

    const { data: counts } = await admin.from("email_recipients").select("status").eq("campaign_id", camp.id);
    const byStatus = (s: string) => (counts || []).filter((r) => r.status === s).length;
    const done = byStatus("queued") === 0;
    await admin
      .from("email_campaigns")
      .update({
        status: done ? "done" : "partial",
        sent: byStatus("sent"),
        failed: byStatus("failed"),
        // Bodies must not linger: clear the encrypted body the moment
        // the campaign finishes.
        ...(done ? { body_enc: null } : {}),
      })
      .eq("id", camp.id);
    results.push({
      campaignId: camp.id,
      sent,
      failed,
      queued: byStatus("queued"),
      blocked: byStatus("blocked"),
      status: done ? "done" : "partial",
      deadlineHit: Date.now() - t0 > DRAIN_DEADLINE_MS,
    });
  }

  return NextResponse.json({ ok: true, data: { campaigns: results } });
}
