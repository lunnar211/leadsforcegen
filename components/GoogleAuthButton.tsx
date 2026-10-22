"use client";
import { useState } from "react";

// Google sign-in through Supabase Auth (OAuth 2.0 / PKCE).
// Requires the Google provider to be enabled in the Supabase dashboard
// (Authentication > Providers > Google) with a Google Cloud OAuth
// Client ID + Secret, and this site's /auth/callback URL allow-listed.
export default function GoogleAuthButton() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function signInWithGoogle() {
    // Lazy import keeps supabase-js out of the auth pages' first bundle.
    const { supabase } = await import("@/lib/supabaseClient");
    if (!supabase) {
      setMsg("Demo mode: Supabase is not configured in this environment, so Google login is disabled here.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) {
      setMsg(/provider is not enabled/i.test(error.message)
        ? "Google sign-in is not enabled yet — the site owner needs to turn on the Google provider in Supabase. Email login works now."
        : error.message);
      setBusy(false);
    }
  }
  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 text-xs text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <button type="button" onClick={signInWithGoogle} disabled={busy} className="btn-ghost btn-block mt-4">
        {busy && <span className="spinner" aria-hidden="true" />}
        Continue with Google
      </button>
      {msg && <p className="mt-2 text-sm text-muted" role="status">{msg}</p>}
    </div>
  );
}
