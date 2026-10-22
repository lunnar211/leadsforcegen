"use client";
import { useState } from "react";

export default function Unsubscribe() {
  const [form, setForm] = useState({ domain: "", email: "", company: "" });
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Recording...");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setMsg(
        res.ok && data.ok
          ? "Done. This business will be excluded from all future LeadsForceGen results."
          : data.error || "Something went wrong. Please try again.",
      );
    } catch {
      setMsg("Network error. Please try again.");
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-bold text-white">Unsubscribe / remove my business</h1>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        LeadsForceGen only lists publicly available business information. If you do not want your business
        to appear in our results, enter its domain or business email below. We will add it to our blocklist
        and exclude it from all future searches and exports.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input aria-label="Business domain" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" placeholder="Business domain (e.g. example.com)" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
        <input aria-label="Business email" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" placeholder="Business email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input aria-label="Company name" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" placeholder="Company name (optional)" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        {msg && <p className="text-sm text-slate-300" role="status">{msg}</p>}
        <button className="w-full rounded-xl bg-indigo-600 py-3 font-semibold hover:bg-indigo-500">Remove my business</button>
      </form>
    </div>
  );
}
