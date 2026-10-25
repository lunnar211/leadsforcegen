import "server-only";
import { getAuthUser, getUsage, serviceClient } from "@/lib/quota";
import { decryptSecret } from "@/lib/email/crypto";
import type { ProviderCreds } from "@/lib/email/providers";
import type { User } from "@supabase/supabase-js";

// Bulk-email routes are Pro-only (the panel is a Pro feature) and the
// plan is always read server-side from profiles — never from the client.
export async function requireProUser(
  req: Request,
): Promise<{ user: User } | { status: number; error: string }> {
  const user = await getAuthUser(req);
  if (!user) return { status: 401, error: "Sign in to use bulk email." };
  const usage = await getUsage(user.id);
  if (!usage || usage.plan !== "pro") {
    return { status: 403, error: "Bulk email is a Pro feature. Upgrade to Pro to send campaigns." };
  }
  return { user };
}

// Decrypt a saved provider credential row into the shape sendOne
// expects. Shared by the manual send route's logic and the auto-drain
// cron route so the two paths can never drift apart on creds parsing.
// Throws on unreadable credentials — callers turn that into a 502 /
// per-campaign error, never a plaintext fallback.
export function decryptCreds(settings: { provider: string; creds: unknown }): ProviderCreds {
  const raw = JSON.parse(decryptSecret(settings.creds as string)) as Record<string, unknown>;
  if (settings.provider === "brevo" || settings.provider === "resend") {
    return { provider: settings.provider, apiKey: String(raw.apiKey || "") };
  }
  return {
    provider: "smtp",
    host: String(raw.host || ""),
    port: Number(raw.port || 587),
    secure: Boolean(raw.secure),
    user: String(raw.user || ""),
    pass: String(raw.pass || ""),
  };
}

export async function loadSettings(userId: string): Promise<{
  provider: string;
  senderName: string;
  senderEmail: string;
  webhookUrl: string | null;
  creds: unknown;
} | null> {
  const admin = serviceClient();
  if (!admin) return null;
  const { data } = await admin
    .from("email_settings")
    .select("provider, sender_name, sender_email, webhook_url, key_enc")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    provider: data.provider as string,
    senderName: data.sender_name as string,
    senderEmail: data.sender_email as string,
    webhookUrl: (data.webhook_url as string | null) || null,
    creds: data.key_enc,
  };
}
