import "server-only";
import { cookies } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_COOKIE, verifyAdminSessionToken } from "@/lib/adminAuth";

// Shared helpers for owner-only admin API routes. All admin data flows
// through these server routes (signed admin session cookie + service
// role), never through the browser Supabase client — RLS gives the anon
// browser client no admin access by design.
export async function requireAdminSession(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminSessionToken(store.get(ADMIN_COOKIE)?.value);
}

export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  return createClient(url, service, { auth: { persistSession: false } });
}
