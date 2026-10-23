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
    });
    return res.ok;
  } catch {
    return false;
  }
}
