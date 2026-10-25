import "server-only";
import { emailShapeOk } from "@/lib/email/extract";

// Platform sender: the site owner's own verified Brevo sender address.
// Mail sent with this option genuinely comes from this address —
// accurate headers, no forgery, no sender-hiding of any kind. It is the
// legal answer to "send without handing over my own credentials": the
// user picks this provider, the platform sends from ITS address, and
// replies go to the user's Reply-To address when one is given.
//
// ENV-GATED: the option only exists when BOTH vars are set. The values
// never reach the browser — the panel only ever learns a boolean from
// /api/email/platform. Never paste either value into chat, code, or
// logs: the owner adds them directly in Vercel Production.
//
// No migration needed: the email_settings CHECK constraint only allows
// brevo/resend/smtp, so a platform row is stored with provider "brevo"
// (the transport genuinely IS Brevo) plus a { platform: true } marker in
// the encrypted blob. The settings route translates it back to
// "platform" for the panel; send/test/drain branch on the marker.
export function platformSenderConfigured(): boolean {
  const email = (process.env.PLATFORM_SENDER_EMAIL || "").trim().toLowerCase();
  const key = (process.env.PLATFORM_BREVO_API_KEY || "").trim();
  return !!email && emailShapeOk(email) && key.length >= 10;
}

export function platformSender(): { fromEmail: string; apiKey: string } | null {
  if (!platformSenderConfigured()) return null;
  return {
    fromEmail: (process.env.PLATFORM_SENDER_EMAIL || "").trim().toLowerCase(),
    apiKey: (process.env.PLATFORM_BREVO_API_KEY || "").trim(),
  };
}
