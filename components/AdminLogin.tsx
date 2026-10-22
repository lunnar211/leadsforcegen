"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg(
          res.status === 503
            ? "Admin login is not configured on the server yet. The owner must set ADMIN_PASSWORD in Vercel (Production) and redeploy — then this form will work."
            : data.error || "Login failed.",
        );
      }
    } catch {
      setMsg("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-bold text-fg">Admin access</h1>
      <p className="mt-2 text-sm text-muted">This panel is restricted to the site owner only. It uses a separate owner login — your normal account login will not work here.</p>
      {!configured && (
        <p className="mt-4 rounded-[var(--radius)] border border-warning bg-warning-bg p-3 text-sm text-warning" role="note">
          Admin login is locked because the server admin credentials are not configured yet (ADMIN_PASSWORD is not set in Vercel).
        </p>
      )}
      <form onSubmit={submit} className="card mt-6 space-y-4 p-5">
        <div>
          <label className="label" htmlFor="admin-email">Admin email</label>
          <input
            id="admin-email" className="input" type="email" inputMode="email" autoComplete="username"
            placeholder="Owner email" value={email} onChange={(e) => setEmail(e.target.value)} required
          />
        </div>
        <div>
          <label className="label" htmlFor="admin-password">Admin password</label>
          <input
            id="admin-password" className="input" type="password" autoComplete="current-password"
            placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} required
          />
        </div>
        {msg && <p className="rounded-[var(--radius)] bg-danger-bg p-3 text-sm text-danger" role="alert">{msg}</p>}
        <button type="submit" className="btn-primary btn-block" disabled={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? "Checking…" : "Unlock admin panel"}
        </button>
      </form>
    </div>
  );
}
