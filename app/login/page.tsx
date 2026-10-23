"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { ensureProfile } from "@/lib/profile";
import GoogleAuthButton from "@/components/GoogleAuthButton";

function friendlyError(raw: string): { text: string; unconfirmed: boolean } {
  if (/email not confirmed/i.test(raw)) {
    return {
      text: "Your email address is not confirmed yet. Open the confirmation email we sent you, or resend it below — then log in.",
      unconfirmed: true,
    };
  }
  if (/invalid login credentials/i.test(raw)) {
    return { text: "Email or password is incorrect. Check both and try again — or sign up if you don't have an account yet.", unconfirmed: false };
  }
  if (/network|fetch/i.test(raw)) {
    return { text: "Network problem reaching the sign-in service. Check your connection and try again.", unconfirmed: false };
  }
  return { text: raw, unconfirmed: false };
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [msg, setMsg] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(""); setResent(""); setUnconfirmed(false);
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Enter your email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (Object.keys(next).length) return;
    if (!supabase) {
      setMsg("Demo mode: Supabase is not configured in this environment, so real login is disabled here.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        const f = friendlyError(error.message);
        setMsg(f.text);
        setUnconfirmed(f.unconfirmed);
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
    setResent(error ? `Could not resend: ${error.message}` : "Confirmation email sent. Check your inbox (and spam folder), then log in.");
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-bold text-fg">Login to LeadsForceGen</h1>
      <p className="mt-2 text-sm text-muted">Welcome back. Sign in to run searches and see your plan usage.</p>

      {!isSupabaseConfigured && (
        <p className="mt-4 rounded-[var(--radius)] border border-warning bg-warning-bg p-3 text-sm text-warning" role="note">
          Demo / offline mode: Supabase env vars are not configured here, so real login is disabled. Set them in Vercel / .env.local to enable auth.
        </p>
      )}

      <form onSubmit={submit} className="card mt-6 space-y-4 p-5" noValidate>
        <div>
          <label className="label" htmlFor="login-email">Email</label>
          <input
            id="login-email" className="input" type="email" inputMode="email" autoComplete="email"
            placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "login-email-error" : undefined}
          />
          {errors.email && <p className="field-error" id="login-email-error" role="alert">{errors.email}</p>}
        </div>
        <div>
          <label className="label" htmlFor="login-password">Password</label>
          <input
            id="login-password" className="input" type="password" autoComplete="current-password"
            placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "login-password-error" : undefined}
          />
          {errors.password && <p className="field-error" id="login-password-error" role="alert">{errors.password}</p>}
          <p className="mt-2 text-right text-sm">
            <Link className="font-semibold text-accent-text underline" href="/forgot-password">Forgot password?</Link>
          </p>
        </div>
        {msg && <p className="rounded-[var(--radius)] bg-danger-bg p-3 text-sm text-danger" role="alert">{msg}</p>}
        {unconfirmed && (
          <button type="button" onClick={resendConfirmation} className="btn-ghost btn-block">Resend confirmation email</button>
        )}
        {resent && <p className="text-sm text-muted" role="status">{resent}</p>}
        <button type="submit" className="btn-primary btn-block" disabled={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? "Signing in…" : "Login"}
        </button>
      </form>

      <GoogleAuthButton />
      <p className="mt-5 text-center text-sm text-muted">
        No account? <Link className="font-semibold text-accent-text underline" href="/signup">Sign up free</Link>
      </p>
    </div>
  );
}
