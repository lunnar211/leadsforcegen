import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/quota";
import { requireProUser, loadSettings } from "@/lib/email/guard";
import { encryptSecret } from "@/lib/email/crypto";
import { emailShapeOk } from "@/lib/email/extract";

export async function GET(req: Request) {
  const auth = await requireProUser(req);
  if ("status" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const s = await loadSettings(auth.user.id);
  if (!s) return NextResponse.json({ ok: true, data: null });
  // Never return the credential itself — only whether one is saved.
  return NextResponse.json({
    ok: true,
    data: { provider: s.provider, senderName: s.senderName, senderEmail: s.senderEmail, webhookUrl: s.webhookUrl, keySet: true },
  });
}

export async function POST(req: Request) {
  const auth = await requireProUser(req);
  if ("status" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const provider = String(body.provider || "");
  const senderEmail = String(body.senderEmail || "").trim().toLowerCase();
  const senderName = String(body.senderName || "").trim().slice(0, 100);
  const webhookUrl = String(body.webhookUrl || "").trim();
  if (!["brevo", "resend", "smtp"].includes(provider)) {
    return NextResponse.json({ ok: false, error: "Pick a provider: Brevo, Resend, or SMTP." }, { status: 400 });
  }
  if (!emailShapeOk(senderEmail)) {
    return NextResponse.json({ ok: false, error: "Enter a valid sender email address." }, { status: 400 });
  }
  if (webhookUrl && !/^https?:\/\//.test(webhookUrl)) {
    return NextResponse.json({ ok: false, error: "Webhook URL must start with http:// or https://." }, { status: 400 });
  }
  let blob: unknown;
  if (provider === "smtp") {
    const host = String(body.host || "").trim();
    const port = Number(body.port || 587);
    const user = String(body.user || "").trim();
    const pass = String(body.pass || "");
    if (!host || !user || !pass || !Number.isFinite(port) || port < 1 || port > 65535) {
      return NextResponse.json({ ok: false, error: "SMTP needs host, port, username, and password." }, { status: 400 });
    }
    blob = { host, port, user, pass, secure: port === 465 };
  } else {
    const apiKey = String(body.apiKey || "").trim();
    if (apiKey.length < 10) {
      return NextResponse.json({ ok: false, error: "Paste your provider API key." }, { status: 400 });
    }
    blob = { apiKey };
  }
  let keyEnc: string;
  try {
    keyEnc = encryptSecret(JSON.stringify(blob));
  } catch {
    return NextResponse.json(
      { ok: false, error: "Email credentials cannot be stored yet — the server secret is not configured." },
      { status: 502 },
    );
  }
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Email is not configured on the server." }, { status: 502 });
  const { error } = await admin.from("email_settings").upsert({
    user_id: auth.user.id,
    provider,
    key_enc: keyEnc,
    sender_name: senderName,
    sender_email: senderEmail,
    webhook_url: webhookUrl || null,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ ok: false, error: "Could not save settings." }, { status: 502 });
  return NextResponse.json({ ok: true, data: { provider, senderEmail, keySet: true } });
}
