"use client";
import { useState } from "react";

// Google sign-in through Supabase Auth (OAuth 2.0 / PKCE).
// Requires the Google provider to be enabled in the Supabase dashboard
// (Authentication > Providers > Google) with a Google Cloud OAuth
// Client ID + Secret, and this site's /auth/callback URL allow-listed.
//
// The OAuth URL is PREFLIGHTED before navigating: when the provider is
// disabled, Supabase answers the authorize URL with a raw JSON error
// page ({"msg":"Unsupported provider: provider is not enabled"}) —
// which is what the owner screenshotted on 2026-10-23. With
// skipBrowserRedirect we get the URL first, probe it, and only send
// the user onward when it actually redirects to Google.
// `disabled` gates Google signup behind the signup page's 18+
// confirmation checkbox: the same age rule applies whichever button
// the user picks, and the checkbox lives on the page, not in here.
export default function GoogleAuthButton({ disabled = false }: { disabled?: boolean }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function signInWithGoogle() {
    const { supabase } = await import("@/lib/supabaseClient");
    if (!supabase) {
      setMsg("Demo mode: Supabase is not configured in this environment, so Google login is disabled here.");
      return;
    }
    setBusy(true);
    setMsg("");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
        skipBrowserRedirect: true,
      },
    });
    if (error || !data?.url) {
      setMsg("Google sign-in could not start. Please use email login for now.");
      setBusy(false);
      return;
    }
    try {
      const probe = await fetch(data.url, { redirect: "manual" });
      // A live provider answers with a redirect (opaque in CORS mode).
      if (probe.type === "opaqueredirect" || (probe.status >= 300 && probe.status < 400)) {
        window.location.href = data.url;
        return;
      }
      const text = await probe.text().catch(() => "");
      if (/provider is not enabled|Unsupported provider/i.test(text) || probe.status >= 400) {
        setMsg("Google sign-in is being connected — it isn't switched on yet. Email login works now.");
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      // If the probe itself is blocked, fall back to the plain redirect.
      window.location.href = data.url;
    }
  }
  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 text-xs text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <button type="button" onClick={signInWithGoogle} disabled={busy || disabled} className="btn-ghost btn-block mt-4">
        {busy && <span className="spinner" aria-hidden="true" />}
        Continue with Google
      </button>
      {disabled && <p className="mt-2 text-center text-xs text-muted">Tick the 18+ confirmation above to continue with Google.</p>}
      {msg && <p className="mt-2 text-sm text-muted" role="status">{msg}</p>}
    </div>
  );
}
