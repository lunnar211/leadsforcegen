import { supabase } from "@/lib/supabaseClient";

// Where should the user go right after authentication? If they have a
// verified MFA factor but the fresh session is only AAL1, they must
// complete the authenticator challenge first — route them to /auth/mfa
// instead of the dashboard. (The dashboard ALSO guards itself, so this
// is the friendly fast path, not the only enforcement.)
export async function nextRouteAfterAuth(): Promise<string> {
  try {
    if (!supabase) return "/dashboard";
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data && data.currentLevel === "aal1" && data.nextLevel === "aal2") return "/auth/mfa";
  } catch { /* fall through to the dashboard, which guards itself */ }
  return "/dashboard";
}
