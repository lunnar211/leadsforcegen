"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Google sign-in through Supabase Auth (OAuth 2.0 / PKCE).
// Requires the Google provider to be enabled in the Supabase dashboard
// (Authentication > Providers > Google) with a Google Cloud OAuth
// Client ID + Secret, and this site's /auth/callback URL allow-listed.
export default function GoogleAuthButton() {
  const [msg, setMsg] = useState("");
  async function signInWithGoogle() {
    if (!supabase) {
      setMsg("Demo mode: Supabase is not configured in this environment, so Google login is disabled here.");
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) setMsg(error.message);
  }
  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
      </div>
      <button
        type="button"
        onClick={signInWithGoogle}
        className="mt-4 w-full rounded-xl border border-white/15 bg-white/5 py-3 font-semibold text-white hover:bg-white/10"
      >
        Continue with Google
      </button>
      {msg && <p className="mt-2 text-sm text-slate-300">{msg}</p>}
    </div>
  );
}
