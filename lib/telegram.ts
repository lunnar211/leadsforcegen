import "server-only";

// Telegram admin bot: sends the owner alerts (payment proofs, signups)
// and powers the /api/telegram webhook commands. Configured purely by
// env: TELEGRAM_BOT_TOKEN (from BotFather) + TELEGRAM_ADMIN_CHAT_ID
// (the owner's chat — the only chat the bot serves). Always fails open:
// a missing config or a Telegram outage must never break a user flow.
export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    // Log the failure mode only — never the message text (it can
    // contain a buyer's email). The caller flow continues regardless.
    console.error("[telegram] send failed:", err instanceof Error ? err.message : "unknown");
    return false;
  }
}

// Fail-open admin alert: fire-and-forget, never throws, never blocks
// the caller's response. Missing env vars => sendTelegram no-ops and
// the site behaves exactly as before. Callers must NOT await this —
// it is deliberately a void call so a Telegram outage adds zero
// latency to signup or proof submission.
export function sendAdminAlert(text: string): void {
  try {
    void sendTelegram(text).catch(() => {});
  } catch {
    // Never throw to the caller, under any circumstance.
  }
}
