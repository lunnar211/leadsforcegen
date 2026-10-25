"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { ensureProfile } from "@/lib/profile";
import GoogleAuthButton from "@/components/GoogleAuthButton";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [msg, setMsg] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState("");
  const router = useRouter();

  // Already signed in? Skip the signup form — go to the app.
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) router.replace("/dashboard");
    });
    return () => { alive = false; };
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(""); setResent("");
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Enter your email address.";
    if (!password) next.password = "Choose a password.";
    else if (password.length < 6) next.password = "Password must be at least 6 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;
    if (!supabase) {
      setMsg("Demo mode: Supabase is not configured in this environment, so real signup is disabled here.");
      return;
    }
    setBusy(true);
    try {
      // Signup goes through the server route, not direct signUp: the
      // route enforces the disposable-mail block + rate limits BEFORE
      // any account exists (a browser-side check alone is bypassable).
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(json?.error || "Could not create your account. Try again.");
        return;
      }
      // Account created pre-confirmed: sign in to get the session.
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.session) {
        setMsg(error?.message || "Account created — please log in.");
        router.push("/login");
        return;
      }
      await ensureProfile();
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    if (!supabase || !email.trim()) return;
    setResent("Sending…");
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    setResent(error ? `Could not resend: ${error.message}` : "Confirmation email sent again. Check your inbox and spam folder.");
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-bold text-fg">Create your LeadsForceGen account</h1>
      <p className="mt-2 text-sm text-muted">Free plan: 30 leads/day. Upgrade to Pro anytime for unlimited* leads, CSV export and full AI outreach.</p>

      {!isSupabaseConfigured && (
        <p className="mt-4 rounded-[var(--radius)] border border-warning bg-warning-bg p-3 text-sm text-warning" role="note">
          Demo / offline mode: Supabase env vars are not configured here, so real signup is disabled. Set them in Vercel / .env.local to enable auth.
        </p>
      )}

      {confirming ? (
        <div className="card mt-6 p-5" role="status">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent-text" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
            Confirm your email to finish
          </h2>
          <p className="mt-2 text-sm text-muted">
            We sent a confirmation link to <b className="text-fg">{email}</b>. Open it, then come back and log in.
            Your dashboard unlocks right after your first login.
          </p>
          <button type="button" onClick={resendConfirmation} className="btn-ghost btn-block mt-4">Resend confirmation email</button>
          {resent && <p className="mt-3 text-sm text-muted" role="status">{resent}</p>}
          <Link href="/login" className="btn-primary btn-block mt-3">Go to login</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="card mt-6 space-y-4 p-5" noValidate>
          <div>
            <label className="label" htmlFor="signup-email">Email</label>
            <input
              id="signup-email" className="input" type="email" inputMode="email" autoComplete="email"
              placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "signup-email-error" : undefined}
            />
            {errors.email && <p className="field-error" id="signup-email-error" role="alert">{errors.email}</p>}
          </div>
          <div>
            <label className="label" htmlFor="signup-password">Password</label>
            <input
              id="signup-password" className="input" type="password" autoComplete="new-password"
              placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "signup-password-error" : "signup-password-hint"}
            />
            {errors.password
              ? <p className="field-error" id="signup-password-error" role="alert">{errors.password}</p>
              : <p className="mt-1.5 text-xs text-muted" id="signup-password-hint">At least 6 characters.</p>}
          </div>
          {msg && <p className="rounded-[var(--radius)] bg-danger-bg p-3 text-sm text-danger" role="alert">{msg}</p>}
          <button type="submit" className="btn-primary btn-block" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? "Creating account…" : "Sign up free"}
          </button>
        </form>
      )}

      <GoogleAuthButton />
      <p className="mt-5 text-center text-sm text-muted">
        Already have an account? <Link className="font-semibold text-accent-text underline" href="/login">Login</Link>
      </p>
    </div>
  );
}
