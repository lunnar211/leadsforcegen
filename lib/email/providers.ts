import "server-only";
import nodemailer from "nodemailer";

// Outbound mail for the Pro bulk panel. The user brings their OWN free
// provider key (Brevo 300/day free, Resend 100/day free, or any SMTP
// such as Gmail with an app password) — nothing is ever sent from a
// shared address, so one user's reputation can never burn another's.
// Every send is per-recipient (no To/CC leak, same rule as the
// reference Laravel app's per-recipient jobs).

export type ProviderCreds =
  | { provider: "brevo"; apiKey: string }
  | { provider: "resend"; apiKey: string }
  | { provider: "smtp"; host: string; port: number; secure: boolean; user: string; pass: string };

export type Attachment = { name: string; content: string; type: string };

export type Outgoing = {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: Attachment[];
};

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://leadsforcegen.vercel.app").replace(/\/$/, "");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Wrap the user's message in one of three simple templates, then append
// the tracking pixel, the opt-out line, and the one-click unsubscribe
// link. The footer is NOT optional: every bulk mail must carry it.
export function buildHtml(opts: {
  template: string;
  bodyHtml: string;
  token: string;
  senderName: string;
}): string {
  const base = siteUrl();
  const pixel = `<img src="${base}/api/email/open/${opts.token}" width="1" height="1" alt="" style="display:none" />`;
  const footer = `<div style="margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;color:#64748b">` +
    `<p>You received this email from ${esc(opts.senderName)}. If you don't want emails like this anymore, ` +
    `<a href="${base}/api/email/unsubscribe/${opts.token}">unsubscribe here</a> and you will never hear from this sender again.</p></div>`;
  const inner = opts.bodyHtml;
  let wrapped: string;
  if (opts.template === "announcement") {
    wrapped = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#2563eb;color:#fff;padding:20px 24px;font-size:20px;font-weight:bold">News &amp; updates</div><div style="padding:24px">${inner}</div></div>`;
  } else if (opts.template === "offer") {
    wrapped = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="border:2px solid #ea580c;padding:20px 24px"><div style="font-size:13px;letter-spacing:1px;color:#ea580c;font-weight:bold">SPECIAL OFFER</div><div style="padding-top:12px">${inner}</div></div></div>`;
  } else {
    wrapped = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:8px">${inner}</div>`;
  }
  return wrapped + footer + pixel;
}

// Rewrite http(s) links so clicks are counted per recipient. The
// unsubscribe link and the pixel are left alone; mailto/anchors/relative
// links are left alone.
export function rewriteLinks(html: string, token: string): string {
  const base = siteUrl();
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (m, url: string) => {
    if (url.startsWith(`${base}/api/email/`)) return m;
    return `href="${base}/api/email/click/${token}?u=${encodeURIComponent(url)}"`;
  });
}

function safeName(name: string): string {
  return name.replace(/[/\\]/g, "").replace(/\.\./g, "").slice(0, 100) || "attachment";
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Provider ${res.status}: ${text.slice(0, 200)}`);
  }
}

export async function sendOne(creds: ProviderCreds, msg: Outgoing): Promise<void> {
  if (creds.provider === "brevo") {
    await postJson(
      "https://api.brevo.com/v3/smtp/email",
      { "api-key": creds.apiKey },
      {
        sender: { name: msg.fromName, email: msg.fromEmail },
        to: [{ email: msg.to }],
        subject: msg.subject,
        htmlContent: msg.html,
        textContent: msg.text,
        attachment: msg.attachments.map((a) => ({ name: safeName(a.name), content: a.content })),
      },
    );
    return;
  }
  if (creds.provider === "resend") {
    await postJson(
      "https://api.resend.com/emails",
      { Authorization: `Bearer ${creds.apiKey}` },
      {
        from: `${msg.fromName} <${msg.fromEmail}>`,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        attachments: msg.attachments.map((a) => ({ filename: safeName(a.name), content: a.content })),
      },
    );
    return;
  }
  const transport = nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    auth: { user: creds.user, pass: creds.pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  await transport.sendMail({
    from: `${msg.fromName} <${msg.fromEmail}>`,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    attachments: msg.attachments.map((a) => ({
      filename: safeName(a.name),
      content: Buffer.from(a.content, "base64"),
      contentType: a.type || undefined,
    })),
  });
}

// Fire a webhook event to the user's URL. Never throws, never blocks
// the send: a dead webhook must not fail a campaign.
export async function fireWebhook(url: string | null, event: Record<string, unknown>): Promise<void> {
  if (!url || !/^https?:\/\//.test(url)) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Webhook delivery is best-effort by design.
  }
}
