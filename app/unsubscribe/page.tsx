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
    <div className="mx-auto w-full max-w-xl px-4 py-10 sm:py-12">
      <h1 className="text-3xl font-bold text-fg">Unsubscribe / remove my business</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        LeadsForceGen only lists publicly available business information. If you do not want your business
        to appear in our results, enter its domain or business email below. We will add it to our blocklist
        and exclude it from all future searches and exports.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <label className="label" htmlFor="unsub-domain">Business domain</label><input id="unsub-domain" aria-label="Business domain" className="input" placeholder="Business domain (e.g. example.com)" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
        <label className="label" htmlFor="unsub-email">Business email <span className="font-normal text-muted">(optional)</span></label><input id="unsub-email" aria-label="Business email" className="input" placeholder="Business email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <label className="label" htmlFor="unsub-company">Company name <span className="font-normal text-muted">(optional)</span></label><input id="unsub-company" aria-label="Company name" className="input" placeholder="Company name" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        {msg && <p className="text-sm text-fg" role="status">{msg}</p>}
        <button className="btn-primary btn-block">Remove my business</button>
      </form>
    </div>
  );
}
