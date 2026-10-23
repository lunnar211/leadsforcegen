"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Factor = { id: string; status: string };

// Account security card: enroll / manage TOTP two-factor authentication
// (Supabase Auth MFA). Enrollment happens here in the dashboard; the
// challenge at sign-in lives at /auth/mfa and is enforced by the
// dashboard guard + post-login routing (lib/mfa.ts).
export default function MfaCard() {
  const [verified, setVerified] = useState<Factor | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) { setLoaded(true); return; }
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { setLoaded(true); return; }
    const { data } = await supabase.auth.mfa.listFactors();
    const v = (data?.totp || []).find((f) => f.status === "verified") || null;
    setVerified(v ? { id: v.id, status: v.status } : null);
    setLoaded(true);
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  async function startEnroll() {
    if (!supabase) return;
    setBusy(true); setMsg("");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
      if (error || !data) { setMsg("Could not start enrollment. Please try again."); return; }
      setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } finally { setBusy(false); }
  }

  async function cancelEnroll() {
    if (supabase && enrolling) { try { await supabase.auth.mfa.unenroll({ factorId: enrolling.id }); } catch { /* best-effort cleanup */ } }
    setEnrolling(null); setCode("");
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !enrolling) return;
    setBusy(true); setMsg("");
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: enrolling.id });
      if (challenge.error || !challenge.data) { setMsg("Could not start the confirmation challenge. Try again."); return; }
      const verify = await supabase.auth.mfa.verify({ factorId: enrolling.id, challengeId: challenge.data.id, code: code.trim() });
      if (verify.error) { setMsg("That code didn't match — check the app and try again."); return; }
      setEnrolling(null); setCode("");
      setMsg("Two-factor authentication is ON for your account.");
      await load();
    } finally { setBusy(false); }
  }

  async function disable() {
    if (!supabase || !verified) return;
    setBusy(true); setMsg("");
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
      if (error) { setMsg("Could not turn it off right now. If you just signed in, complete a two-factor check first, then try again."); return; }
      setMsg("Two-factor authentication is off.");
      await load();
    } finally { setBusy(false); }
  }

  if (!loaded) return null;

  return (
    <section className="mt-8" aria-label="Account security">
      <h2 className="text-lg font-semibold text-fg">Account security</h2>
      <div className="card mt-3 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: verified ? "var(--success)" : "var(--warning)" }} aria-hidden="true" />
          <p className="font-semibold text-fg">Two-factor authentication (2FA)</p>
          <span className="text-sm text-muted">{verified ? "On — an authenticator code is required at sign-in." : "Off — add an authenticator app for a much harder-to-steal account."}</span>
        </div>
        {msg && <p className="mt-3 text-sm text-fg" role="status">{msg}</p>}

        {!verified && !enrolling && (
          <button type="button" className="btn-primary mt-4 px-5" onClick={startEnroll} disabled={busy}>
            {busy ? "Starting…" : "Enable two-factor"}
          </button>
        )}

        {enrolling && (
          <form onSubmit={confirmEnroll} className="mt-4 space-y-4">
            <p className="text-sm leading-relaxed text-muted">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, Microsoft Authenticator…), then enter the 6-digit code it shows.
            </p>
            {/* Supabase returns the TOTP QR as a data-URI SVG image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrolling.qr} alt="Two-factor enrollment QR code" width={176} height={176} className="rounded-lg border border-border bg-white p-2" />
            <p className="text-xs text-muted">Can&apos;t scan? Enter this secret manually: <code className="break-all font-semibold text-fg">{enrolling.secret}</code></p>
            <div>
              <label className="label" htmlFor="mfa-enroll-code">6-digit code</label>
              <input
                id="mfa-enroll-code" className="input max-w-[220px] tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code"
                placeholder="123456" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary px-5" disabled={busy || code.length !== 6}>{busy ? "Confirming…" : "Confirm and turn on"}</button>
              <button type="button" className="btn-ghost px-5" onClick={cancelEnroll} disabled={busy}>Cancel</button>
            </div>
          </form>
        )}

        {verified && (
          <button type="button" className="btn-ghost mt-4 px-5" onClick={disable} disabled={busy}>
            {busy ? "Working…" : "Turn off two-factor"}
          </button>
        )}
      </div>
    </section>
  );
}
