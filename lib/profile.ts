import { supabase } from "@/lib/supabaseClient";

// Ensures a profiles row exists for the signed-in user (plan defaults to
// 'free' in the database). Insert-only on purpose: the RLS policy allows a
// user to insert their own row, and plan/role changes are server-only, so
// a duplicate-key error here simply means the row already exists.
export async function ensureProfile(): Promise<void> {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .insert({ id: user.id, email: user.email ?? null });
    if (error && error.code !== "23505") {
      // Non-fatal: quota treats a missing profile as the free plan.
      console.warn("ensureProfile:", error.message);
    }
  } catch {
    /* non-fatal */
  }
}
