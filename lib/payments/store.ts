import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Duplicate-payment / replay protection.
//
// Source of truth when configured: Supabase tables with UNIQUE constraints —
//   payments.gateway_payment_id  UNIQUE
//   payments.gateway_order_id    UNIQUE
//   webhook_events.gateway_event_id UNIQUE
// Inserts use on-conflict-do-nothing semantics, so a replayed webhook, a
// double click, or a retried verify call can never double-record a payment
// or double-upgrade a user.
//
// Fallback (Supabase not configured, demo/local): a process-local Set. This
// only protects a single running instance — configure Supabase for real use.

const globalStore = globalThis as unknown as { __lfgSeen?: Set<string> };
if (!globalStore.__lfgSeen) globalStore.__lfgSeen = new Set<string>();

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only, never NEXT_PUBLIC
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Returns true if this payment/event was already processed (skip it). */
export async function alreadyProcessed(kind: "payment" | "order" | "event", gateway: string, id: string): Promise<boolean> {
  const memKey = `${kind}:${gateway}:${id}`;
  if (globalStore.__lfgSeen!.has(memKey)) return true;
  const sb = serviceClient();
  if (sb && id) {
    try {
      const table = kind === "event" ? "webhook_events" : "payments";
      const col = kind === "event" ? "gateway_event_id" : kind === "payment" ? "gateway_payment_id" : "gateway_order_id";
      const { data } = await sb.from(table).select("id").eq("gateway", gateway).eq(col, id).limit(1);
      if (data && data.length > 0) { globalStore.__lfgSeen!.add(memKey); return true; }
    } catch { /* table may not exist yet in demo mode */ }
  }
  return false;
}

/** Records a verified payment + marks ids as processed. No-op-safe on duplicates. */
export async function recordPayment(row: {
  gateway: string; gatewayPaymentId: string; gatewayOrderId?: string;
  userId?: string | null; email?: string | null; plan: string; amount: number; currency: string;
}): Promise<void> {
  globalStore.__lfgSeen!.add(`payment:${row.gateway}:${row.gatewayPaymentId}`);
  if (row.gatewayOrderId) globalStore.__lfgSeen!.add(`order:${row.gateway}:${row.gatewayOrderId}`);
  const sb = serviceClient();
  if (!sb) return;
  try {
    // ignoreDuplicates = on-conflict-do-nothing on the UNIQUE columns.
    await sb.from("payments").upsert(
      { gateway: row.gateway, gateway_payment_id: row.gatewayPaymentId, gateway_order_id: row.gatewayOrderId || null, user_id: row.userId || null, email: row.email || null, plan: row.plan, amount: row.amount, currency: row.currency, status: "captured" },
      { onConflict: "gateway_payment_id", ignoreDuplicates: true },
    );
    if (row.userId) await sb.from("profiles").update({ plan: row.plan }).eq("id", row.userId);
    if (row.email && !row.userId) await sb.from("profiles").update({ plan: row.plan }).eq("email", row.email);
  } catch { /* demo mode: never fail the request because of bookkeeping */ }
}

export async function recordWebhookEvent(gateway: string, eventId: string, type: string): Promise<boolean> {
  // Returns true if this event is a duplicate and must be skipped.
  if (await alreadyProcessed("event", gateway, eventId)) return true;
  globalStore.__lfgSeen!.add(`event:${gateway}:${eventId}`);
  const sb = serviceClient();
  if (sb && eventId) {
    try {
      const { error } = await sb.from("webhook_events").insert({ gateway, gateway_event_id: eventId, type });
      if (error) return true; // unique violation etc. => treat as duplicate, skip
    } catch { return true; }
  }
  return false;
}
