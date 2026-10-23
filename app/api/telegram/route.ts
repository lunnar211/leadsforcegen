import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegram } from "@/lib/telegram";
import { reviewManualPayment } from "@/lib/manualPayments";
import { queryPlaces } from "@/lib/engine/placesDb";

export const maxDuration = 60;

// Telegram admin bot webhook. Telegram POSTs every update here; the bot
// serves ONLY the owner's chat (TELEGRAM_ADMIN_CHAT_ID) and only when
// the shared webhook secret matches (set via setWebhook secret_token).
// This is what makes the bot answer 24/7: it runs on the same Vercel
// deployment as the site. Every path returns 200 so Telegram does not
// retry storms; unknown chats and bad secrets are silently ignored.
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  return createClient(url, service, { auth: { persistSession: false } });
}

const HELP = [
  "LeadsForceGen admin bot — commands:",
  "/status — users, searches today, revenue this month, pending payments",
  "/payments — payment proofs waiting for approval (with short ids)",
  "/approve <id> — approve a pending payment (activates Pro)",
  "/reject <id> — reject a pending payment",
  "/users — latest signups",
  "/diag — quick database health (full X-ray is in the admin panel)",
  "/leads <niche> <city> — instant top leads from the database, same data as the website (e.g. /leads dentist dubai)",
].join("\n");

// City centers for /leads (the website search geocodes any place on
// Earth; the bot answers instantly for the cities the stored database
// covers and says so honestly for the rest).
const CITY_CENTERS: Record<string, { lat: number; lon: number; label: string }> = {
  dubai: { lat: 25.2048, lon: 55.2708, label: "Dubai" },
  "abu dhabi": { lat: 24.4539, lon: 54.3773, label: "Abu Dhabi" },
  kathmandu: { lat: 27.7103, lon: 85.3222, label: "Kathmandu" },
  pokhara: { lat: 28.2096, lon: 83.9856, label: "Pokhara" },
  "new york": { lat: 40.7128, lon: -74.006, label: "New York" },
  nyc: { lat: 40.7128, lon: -74.006, label: "New York" },
  "los angeles": { lat: 34.0522, lon: -118.2437, label: "Los Angeles" },
  la: { lat: 34.0522, lon: -118.2437, label: "Los Angeles" },
  chicago: { lat: 41.8781, lon: -87.6298, label: "Chicago" },
  houston: { lat: 29.7604, lon: -95.3698, label: "Houston" },
  miami: { lat: 25.7617, lon: -80.1918, label: "Miami" },
};

function normalizeBotNiche(raw: string): string {
  const n = raw.toLowerCase().trim();
  const plurals: Record<string, string> = {
    dentists: "dentist", restaurants: "restaurant", cafes: "cafe", hotels: "hotel",
    pharmacies: "pharmacy", clinics: "clinic", gyms: "gym", salons: "salon",
    plumbers: "plumber", electricians: "electrician", lawyers: "lawyer",
  };
  return plurals[n] || n;
}

async function leadsText(nicheRaw: string, cityRaw: string): Promise<string> {
  const city = CITY_CENTERS[cityRaw.toLowerCase().trim()];
  if (!city) {
    return `The bot answers instantly for: ${[...new Set(Object.values(CITY_CENTERS).map((c) => c.label))].join(", ")}.\nFor any other city, use the website search — it geocodes the whole world: leadsforcegen.vercel.app`;
  }
  const niche = normalizeBotNiche(nicheRaw);
  const rows = await queryPlaces(niche, [nicheRaw], city.lat, city.lon, 20, 8);
  if (!rows.length) {
    return `No stored leads for "${nicheRaw}" in ${city.label} yet — that category/city is still being loaded. The website search also checks live sources: leadsforcegen.vercel.app`;
  }
  const withEmail = rows.filter((r) => r.email).length;
  const withPhone = rows.filter((r) => r.phone).length;
  const lines = rows.map((r, i) => {
    const contact = [r.phone ? `📞 ${r.phone}` : "", r.email ? `✉️ ${r.email}` : ""].filter(Boolean).join(" · ");
    return `${i + 1}. ${r.name}${contact ? `\n   ${contact}` : ""}${r.website ? `\n   🌐 ${r.website}` : ""}`;
  });
  return [
    `🎯 Top ${rows.length} ${niche} leads — ${city.label} (stored database, same as the website)`,
    `Contacts in this batch: ${withPhone}/${rows.length} phone · ${withEmail}/${rows.length} email`,
    "",
    ...lines,
    "",
    "Full search + Excel/CSV export: leadsforcegen.vercel.app",
  ].join("\n");
}

type Admin = NonNullable<ReturnType<typeof serviceClient>>;

async function statusText(admin: Admin): Promise<string> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfMonth = new Date(Date.UTC(startOfDay.getUTCFullYear(), startOfDay.getUTCMonth(), 1));
  const [users, usersToday, searchesToday, pending, places] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", startOfDay.toISOString()),
    admin.from("searches").select("*", { count: "exact", head: true }).gte("created_at", startOfDay.toISOString()),
    admin.from("payments").select("*", { count: "exact", head: true }).eq("gateway", "manual").eq("status", "pending"),
    admin.from("places").select("*", { count: "exact", head: true }),
  ]);
  const { data: captured } = await admin
    .from("payments")
    .select("amount, currency")
    .eq("status", "captured")
    .gte("created_at", startOfMonth.toISOString());
  const byCurrency = new Map<string, number>();
  for (const r of captured || []) byCurrency.set(r.currency, (byCurrency.get(r.currency) || 0) + Number(r.amount || 0));
  const revenue = [...byCurrency.entries()].map(([c, v]) => `${c} ${v.toLocaleString()}`).join(" · ") || "none yet";
  return [
    "📊 LeadsForceGen status",
    `Users: ${users.count ?? 0} (+${usersToday.count ?? 0} today)`,
    `Searches today: ${searchesToday.count ?? 0}`,
    `Revenue this month: ${revenue}`,
    `Pending payments: ${pending.count ?? 0}`,
    `Lead database: ${(places.count ?? 0).toLocaleString()} businesses stored`,
  ].join("\n");
}

async function paymentsText(admin: Admin): Promise<string> {
  const { data } = await admin
    .from("payments")
    .select("id, email, amount, currency, method, months, created_at")
    .eq("gateway", "manual")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);
  if (!data?.length) return "No payments waiting for approval. ✅";
  const lines = data.map(
    (p) => `• ${p.currency} ${Number(p.amount).toLocaleString()} — ${p.email || "unknown"} via ${p.method || "manual"} (${p.months || 1} mo)\n  id: ${p.id.slice(0, 8)}`,
  );
  return [`🧾 ${data.length} payment(s) waiting:`, ...lines, "", "Reply /approve <id> or /reject <id> (the 8-char id is enough)."].join("\n");
}

async function usersText(admin: Admin): Promise<string> {
  const { data } = await admin
    .from("profiles")
    .select("email, plan, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  if (!data?.length) return "No users yet.";
  return ["👥 Latest signups:", ...data.map((u) => `• ${u.email || "?"} — ${u.plan} — ${String(u.created_at).slice(0, 10)}`)].join("\n");
}

async function diagText(admin: Admin): Promise<string> {
  const countries = ["AE", "NP"];
  const counts = await Promise.all(
    countries.map(async (cc) => {
      const { count } = await admin.from("places").select("*", { count: "exact", head: true }).eq("country", cc);
      return `${cc}: ${(count ?? 0).toLocaleString()}`;
    }),
  );
  return `🩺 Quick health\nLead database by country: ${counts.join(" · ")}\nFull pipeline X-ray (geocoder, sources, AI): open the admin panel → Run diagnostics.`;
}

async function reviewByShortId(admin: Admin, shortId: string, action: "approve" | "reject"): Promise<string> {
  const needle = shortId.trim().toLowerCase();
  if (needle.length < 4) return "Give me at least 4 characters of the payment id (see /payments).";
  const { data } = await admin
    .from("payments")
    .select("id, email, amount, currency")
    .eq("gateway", "manual")
    .eq("status", "pending")
    .limit(50);
  const matches = (data || []).filter((p) => p.id.toLowerCase().startsWith(needle));
  if (!matches.length) return `No pending payment starts with "${needle}". /payments shows the current queue.`;
  if (matches.length > 1) return "That id matches more than one payment — use more characters.";
  const p = matches[0];
  const result = await reviewManualPayment(admin, p.id, action);
  if (!result.ok) return `Could not ${action}: ${result.error}`;
  return action === "approve"
    ? `✅ Approved — ${p.currency} ${Number(p.amount).toLocaleString()} from ${p.email || "buyer"}. Pro is active${result.periodEnd ? ` until ${result.periodEnd.slice(0, 10)}` : ""}.`
    : `❌ Rejected — ${p.currency} ${Number(p.amount).toLocaleString()} from ${p.email || "buyer"}.`;
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: true });
  }
  const update = (await req.json().catch(() => null)) as { message?: { chat?: { id?: number }; text?: string } } | null;
  const msg = update?.message;
  const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!msg?.chat?.id || !adminChat || String(msg.chat.id) !== adminChat) {
    return NextResponse.json({ ok: true });
  }
  const text = String(msg.text || "").trim();
  const [cmdRaw, ...args] = text.split(/\s+/);
  const cmd = (cmdRaw || "").toLowerCase().replace(/@.*$/, "");
  const admin = serviceClient();
  let reply: string;
  if (!admin) {
    reply = "Server database is not configured — check the Supabase env vars in Vercel.";
  } else if (cmd === "/start" || cmd === "/help") {
    reply = `👋 Hi Dipesh.\n${HELP}`;
  } else if (cmd === "/status") {
    reply = await statusText(admin);
  } else if (cmd === "/payments") {
    reply = await paymentsText(admin);
  } else if (cmd === "/users") {
    reply = await usersText(admin);
  } else if (cmd === "/diag") {
    reply = await diagText(admin);
  } else if (cmd === "/leads") {
    reply = args[0] && args[1]
      ? await leadsText(args[0], args.slice(1).join(" "))
      : "Usage: /leads <niche> <city> — e.g. /leads dentist dubai or /leads restaurant kathmandu";
  } else if (cmd === "/approve" || cmd === "/reject") {
    reply = args[0] ? await reviewByShortId(admin, args[0], cmd === "/approve" ? "approve" : "reject") : `Usage: ${cmd} <id> — /payments shows the ids.`;
  } else if (cmd.startsWith("/")) {
    reply = `I don't know ${cmd} yet.\n${HELP}`;
  } else {
    reply = HELP;
  }
  await sendTelegram(reply);
  return NextResponse.json({ ok: true });
}
