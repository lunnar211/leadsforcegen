import { NextResponse } from "next/server";
import { requireProUser, loadSettings } from "@/lib/email/guard";
import { decryptSecret } from "@/lib/email/crypto";
import { sendOne, type ProviderCreds } from "@/lib/email/providers";
import { platformSender } from "@/lib/email/platform";
import { rateLimit } from "@/lib/rate-limit";

// "Send test email to myself": one mail to the user's OWN sender
// address through their SAVED provider settings, so they can prove
// the setup works before sending a campaign. Pro-gated like every
// other email route; the credential is decrypted server-side and
// never returned. No campaign row, no tracking pixel, no recipients
// besides the user themselves — this is a setup check, not bulk mail.
// Rate-limited (5/hour per user) so the button can't become a
// back-door around the campaign daily caps.
export async function POST(req: Request) {
  const auth = await requireProUser(req);
  if ("status" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!(await rateLimit(`email-test:${auth.user.id}`, 5, 3600_000))) {
    return NextResponse.json({ ok: false, error: "Too many test emails — try again later." }, { status: 429 });
  }
  const settings = await loadSettings(auth.user.id);
  if (!settings) {
    return NextResponse.json({ ok: false, error: "Connect a provider first (Bulk Email → Settings)." }, { status: 400 });
  }
  // Platform sender test: From is the owner's verified platform
  // address, and the test goes to the signed-in user's own account
  // email (there is no user sender address for platform). Same
  // Pro gate and 5/hour rate limit as every other test.
  let testIsPlatform = false;
  let testReplyTo: string | null = null;
  try {
    const marker = JSON.parse(decryptSecret(settings.creds as string)) as Record<string, unknown>;
    if (marker.platform === true) {
      testIsPlatform = true;
      testReplyTo = typeof marker.replyTo === "string" ? marker.replyTo : null;
    }
  } catch {
    // Not platform-marked: the parse below fails closed as before.
  }
  if (testIsPlatform) {
    const plat = platformSender();
    if (!plat) {
      return NextResponse.json({ ok: false, error: "Platform sender is not configured on the server." }, { status: 502 });
    }
    const to = auth.user.email || "";
    if (!to) {
      return NextResponse.json({ ok: false, error: "No account email to send the test to." }, { status: 400 });
    }
    const fromName = settings.senderName || "LeadsForceGen";
    try {
      await sendOne(
        { provider: "brevo", apiKey: plat.apiKey },
        {
          fromName,
          fromEmail: plat.fromEmail,
          replyTo: testReplyTo || plat.fromEmail,
          to,
          subject: "LeadsForceGen test email — platform sender works",
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:8px"><p>This is a test email from the LeadsForceGen platform sender.</p><p>Campaign mail with this provider goes out from the platform address, and replies go to your Reply-To address when one is set.</p></div>`,
          text: `This is a test email from the LeadsForceGen platform sender. Campaign mail with this provider goes out from the platform address.`,
          attachments: [],
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 300) : "Send failed";
      return NextResponse.json({ ok: false, error: `Test email failed: ${msg}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, data: { to, provider: "platform" } });
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
  try {
    await sendOne(creds, {
      fromName: settings.senderName,
      fromEmail: settings.senderEmail,
      to: settings.senderEmail,
      subject: "LeadsForceGen test email — your sender works",
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:8px"><p>This is a test email from your LeadsForceGen bulk-email setup.</p><p>Your provider (${settings.provider}) is connected and sending works. Campaign mail will go out from this same address.</p></div>`,
      text: `This is a test email from your LeadsForceGen bulk-email setup. Your provider (${settings.provider}) is connected and sending works.`,
      attachments: [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "Send failed";
    return NextResponse.json({ ok: false, error: `Test email failed: ${msg}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, data: { to: settings.senderEmail, provider: settings.provider } });
}
