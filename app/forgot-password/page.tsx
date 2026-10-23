"use client";
import { useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

// Password reset, step 1: ask Supabase to email a recovery link. The
// link lands on /reset-password (allow-listed in Supabase Auth → URL
// Configuration). The response copy is deliberately neutral so the
// page never reveals whether an email has an account.
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!email.trim()) { setMsg("Enter your email address."); return; }
    if (!supabase) { setMsg("Demo mode: Supabase is not configured here, so email is disabled in this environment."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setMsg(/rate limit|security purposes|only request/i.test(error.message)
          ? "Please wait a minute before requesting another reset email — the mail service limits how often it sends."
          : error.message);
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-bold text-fg">Forgot your password?</h1>
      <p className="mt-2 text-sm text-muted">Enter your account email and we&rsquo;ll send you a link to set a new password.</p>

      {!isSupabaseConfigured && (
        <p className="mt-4 rounded-[var(--radius)] border border-warning bg-warning-bg p-3 text-sm text-warning" role="note">
          Demo / offline mode: Supabase is not configured here, so reset email is disabled in this environment.
        </p>
      )}

      {sent ? (
        <div className="card mt-6 p-5" role="status">
          <p className="text-sm text-fg"><b>Check your inbox.</b> If an account exists for {email.trim()}, a password-reset link is on its way.</p>
          <p className="mt-2 text-sm text-muted">The link expires after a while and can be used once. Don&rsquo;t see it? Check spam/promotions, or wait a minute and request another.</p>
          <Link href="/login" className="btn-primary btn-block mt-5">Back to login</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="card mt-6 space-y-4 p-5" noValidate>
          <div>
            <label className="label" htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email" className="input" type="email" inputMode="email" autoComplete="email"
              placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {msg && <p className="rounded-[var(--radius)] bg-danger-bg p-3 text-sm text-danger" role="alert">{msg}</p>}
          <button type="submit" className="btn-primary btn-block" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-muted">
        Remembered it? <Link className="font-semibold text-accent-text underline" href="/login">Back to login</Link>
      </p>
    </div>
  );
}
