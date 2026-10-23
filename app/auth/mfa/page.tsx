"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// MFA challenge: shown after sign-in when the account has a verified
// authenticator factor but the session is still AAL1. Verifying a TOTP
// code upgrades the session to AAL2 and continues to the dashboard.
export default function MfaChallengePage() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!supabase) { setChecking(false); return; }
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { router.replace("/login"); return; }
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = (data?.totp || []).find((f) => f.status === "verified");
      if (!verified) { router.replace("/dashboard"); return; }
      // Already AAL2? Nothing to do here.
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.data?.currentLevel === "aal2") { router.replace("/dashboard"); return; }
      setFactorId(verified.id);
      setChecking(false);
    })();
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !factorId) return;
    setBusy(true); setMsg("");
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data) { setMsg("Could not start the challenge. Try again."); return; }
      const verify = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: code.trim() });
      if (verify.error) { setMsg("That code didn't match. Check your authenticator app and try again."); return; }
      router.replace("/dashboard");
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-bold text-fg">Two-factor check</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Your account has two-factor authentication on. Enter the 6-digit code from your authenticator app to finish signing in.
      </p>
      {checking ? (
        <p className="mt-6 text-sm text-muted" role="status">Checking your account…</p>
      ) : (
        <form onSubmit={submit} className="card mt-6 space-y-4 p-5">
          <div>
            <label className="label" htmlFor="mfa-code">Authenticator code</label>
            <input
              id="mfa-code" className="input tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code"
              placeholder="123456" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required
            />
          </div>
          {msg && <p className="rounded-[var(--radius)] bg-danger-bg p-3 text-sm text-danger" role="alert">{msg}</p>}
          <button type="submit" className="btn-primary btn-block" disabled={busy || code.length !== 6}>
            {busy ? "Verifying…" : "Verify and continue"}
          </button>
          <p className="text-center text-sm">
            <Link href="/login" className="font-semibold text-accent">Back to login</Link>
          </p>
        </form>
      )}
    </div>
  );
}
