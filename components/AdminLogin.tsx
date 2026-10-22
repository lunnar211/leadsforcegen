"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Checking...");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(data.error || "Login failed.");
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-2xl font-bold text-white">Admin access — LeadsForceGen</h1>
      <p className="mt-2 text-sm text-slate-400">This panel is restricted to the site owner only.</p>
      {!configured && (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          Admin login is locked because the server admin credentials are not configured yet.
        </p>
      )}
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          placeholder="Admin email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          placeholder="Admin password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {msg && <p className="text-sm text-slate-300">{msg}</p>}
        <button className="w-full rounded-xl bg-indigo-600 py-3 font-semibold hover:bg-indigo-500">
          Unlock admin panel
        </button>
      </form>
    </div>
  );
}
