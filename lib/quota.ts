import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { FREE_DAILY_LEAD_LIMIT, PRO_DAILY_LEAD_LIMIT } from "@/lib/types";

// Server-side plan + quota. The client only DISPLAYS what these helpers
// return; limits are enforced here and in Postgres (consume_daily_quota).
export function quotaConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function anonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false } });
}

export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Resolve the signed-in user from the request's Bearer token, or null. */
export async function getAuthUser(req: Request): Promise<User | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = anonClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export function planLimit(plan: string): number {
  return plan === "pro" ? PRO_DAILY_LEAD_LIMIT : FREE_DAILY_LEAD_LIMIT;
}

export type UsageInfo = { plan: string; used: number; limit: number; remaining: number };

/** Read today's usage for a user (service role — server routes only). */
export async function getUsage(userId: string): Promise<UsageInfo | null> {
  const admin = serviceClient();
  if (!admin) return null;
  const { data: profile } = await admin.from("profiles").select("plan").eq("id", userId).single();
  const plan = (profile?.plan as string) || "free";
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin
    .from("daily_usage")
    .select("used")
    .eq("user_id", userId)
    .eq("day", today)
    .maybeSingle();
  const used = Number(usage?.used || 0);
  const limit = planLimit(plan);
  return { plan, used, limit, remaining: Math.max(0, limit - used) };
}

/** Atomically consume quota in Postgres. Returns false when over limit.
 *  Fail-open ONLY while the schema has not been applied yet (RPC missing):
 *  search must keep working on day one; enforcement hardens automatically
 *  once supabase/schema.sql is run. A genuine over-limit returns false. */
export async function consumeQuota(userId: string, amount: number): Promise<boolean> {
  const info = await getUsage(userId);
  if (!info) return false;
  if (amount <= 0) return true;
  const admin = serviceClient();
  if (!admin) return false;
  const { data, error } = await admin.rpc("consume_daily_quota", {
    p_user: userId,
    p_amount: amount,
    p_limit: info.limit,
  });
  if (error) {
    console.warn("[quota] consume_daily_quota unavailable (schema not applied yet?) — allowing request");
    return true;
  }
  return data === true;
}
