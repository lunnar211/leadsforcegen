"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Password reset, step 2: the recovery link from the email lands here
// carrying a PKCE `code` (or a session in the URL). Exchange it, then
// let the user set a new password via updateUser. Without a valid
// session the page explains the link is invalid/expired instead of
// showing a dead form.
function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) { setLinkError("Demo mode: Supabase is not configured in this environment."); return; }
    let alive = true;
    (async () => {
      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!alive) return;
        if (error) { setLinkError("This reset link is invalid or has expired. Request a fresh one and use it right away."); return; }
        setReady(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (data.session) setReady(true);
      else setLinkError("This reset link is invalid or has expired. Request a fresh one and use it right away.");
    })();
    return () => { alive = false; };
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (password.length < 8) { setMsg("Use at least 8 characters for the new password."); return; }
    if (password !== confirm) { setMsg("The two passwords don't match."); return; }
    if (!supabase) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setMsg(error.message); return; }
      setDone(true);
      setTimeout(() => { router.push("/dashboard"); router.refresh(); }, 1200);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-bold text-fg">Set a new password</h1>
      {linkError ? (
        <div className="card mt-6 p-5" role="alert">
          <p className="text-sm text-danger">{linkError}</p>
          <Link href="/forgot-password" className="btn-primary btn-block mt-5">Request a new reset link</Link>
        </div>
      ) : !ready ? (
        <p className="mt-6 text-sm text-muted" role="status">Checking your reset link…</p>
      ) : done ? (
        <div className="card mt-6 p-5" role="status">
          <p className="text-sm text-fg"><b>Password updated.</b> Taking you to your dashboard…</p>
        </div>
      ) : (
        <form onSubmit={submit} className="card mt-6 space-y-4 p-5" noValidate>
          <div>
            <label className="label" htmlFor="new-password">New password</label>
            <input
              id="new-password" className="input" type="password" autoComplete="new-password"
              placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password" className="input" type="password" autoComplete="new-password"
              placeholder="Repeat the new password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {msg && <p className="rounded-[var(--radius)] bg-danger-bg p-3 text-sm text-danger" role="alert">{msg}</p>}
          <button type="submit" className="btn-primary btn-block" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-muted">
        <Link className="font-semibold text-accent-text underline" href="/login">Back to login</Link>
      </p>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-md px-4 py-10 text-sm text-muted">Loading…</div>}>
      <ResetForm />
    </Suspense>
  );
}
