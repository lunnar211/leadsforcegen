"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { type Lead } from "@/lib/types";
import { supabase } from "@/lib/supabaseClient";

type HistoryItem = { at: string; industry: string; location: string; count: number };
type UsageState = { configured: boolean; plan: string; used: number; limit: number; remaining: number };

// Plan and usage come ONLY from the server (/api/usage, backed by Supabase
// + the consume_daily_quota Postgres function). This page displays them;
// it never decides them. Search history below is device-local display data.
export default function Dashboard() {
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [form, setForm] = useState({ leadType: "B2B companies", industry: "", location: "", size: "11-50", keywords: "" });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [note, setNote] = useState(""); const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("leadsforcegen_history") || "[]"); } catch { return []; }
  });
  const [outreach, setOutreach] = useState(""); const [selected, setSelected] = useState<Lead | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage", { headers: await authHeaders() });
      const d = await res.json().catch(() => ({}));
      if (d.data) setUsage(d.data as UsageState);
    } catch { /* leave usage null; UI shows a loading/demo state */ }
  }, [authHeaders]);

  useEffect(() => {
    (async () => { await loadUsage(); })();
  }, [loadUsage]);

  const isPro = usage?.plan === "pro";

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/ai/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(data.error || "Search failed. Please try again.");
        setLeads([]);
        if (data.usage) setUsage(data.usage);
        return;
      }
      const results: Lead[] = data.leads || [];
      setLeads(results); setNote(data.note || ""); setSource(data.source || "");
      if (data.usage) setUsage(data.usage); else await loadUsage();
      const item = { at: new Date().toISOString(), industry: form.industry, location: form.location, count: results.length };
      const hist = [item, ...history].slice(0, 20); setHistory(hist); localStorage.setItem("leadsforcegen_history", JSON.stringify(hist));
      if (supabase) {
        try {
          const { data: u } = await supabase.auth.getUser();
          if (u.user) {
            await supabase.from("searches").insert({ user_id: u.user.id, industry: form.industry, location: form.location, keywords: form.keywords, result_count: results.length });
            await supabase.from("leads").insert(results.map(l => ({ user_id: u.user.id, company: l.company, industry: l.industry, location: l.location, size: l.size, website: l.website, description: l.description, score: l.score })));
          }
        } catch {}
      }
    } finally { setLoading(false); }
  }

  function exportCsv() {
    if (!isPro) { alert("CSV export is a Pro feature. Upgrade to Pro for CSV export."); return; }
    const rows = [["company", "industry", "location", "size", "website", "email", "phone", "address", "score", "source_url", "description"], ...leads.map(l => [l.company, l.industry, l.location, l.size, l.website, l.email || "", l.phone || "", l.address || "", String(l.score), l.sourceUrl || "", l.description])];
    const csv = rows.map(r => r.map(c => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "leadsforcegen-leads.csv"; a.click();
  }

  async function genOutreach(lead: Lead) {
    setSelected(lead); setOutreach("Generating…");
    const res = await fetch("/api/ai/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) });
    const data = await res.json(); setOutreach(data.message || "");
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">LeadsForceGen Dashboard</h1>
        <div className="text-sm flex items-center gap-3">
          <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1">Plan: <b className="text-white">{(usage?.plan || "free").toUpperCase()}</b></span>
          <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1">
            {usage === null
              ? "Loading usage…"
              : !usage.configured
                ? "Demo mode — server quotas activate when the database is connected"
                : isPro
                  ? `Unlimited* — ${usage.used} / ${usage.limit} fair-use leads used today`
                  : `${usage.remaining} / ${usage.limit} free leads left today`}
          </span>
          {!isPro && <Link href="/checkout" className="bg-indigo-600 px-3 py-1.5 rounded-full font-semibold">Upgrade to Pro</Link>}
        </div>
      </div>

      <form onSubmit={search} className="grid md:grid-cols-5 gap-3 mt-6 bg-white/5 border border-white/10 rounded-2xl p-4">
        <input aria-label="Lead type" className="rounded-xl bg-slate-900 border border-white/10 px-3 py-2.5" placeholder="Lead type (e.g. Restaurants)" value={form.leadType} onChange={set("leadType")} />
        <input aria-label="Industry" className="rounded-xl bg-slate-900 border border-white/10 px-3 py-2.5" placeholder="Industry" value={form.industry} onChange={set("industry")} />
        <input aria-label="Location" className="rounded-xl bg-slate-900 border border-white/10 px-3 py-2.5" placeholder="Location" value={form.location} onChange={set("location")} />
        <select aria-label="Company size" className="rounded-xl bg-slate-900 border border-white/10 px-3 py-2.5" value={form.size} onChange={set("size")}><option>1-10</option><option>11-50</option><option>51-200</option><option>201-1000</option><option>1000+</option></select>
        <input aria-label="Keywords" className="rounded-xl bg-slate-900 border border-white/10 px-3 py-2.5" placeholder="Keywords" value={form.keywords} onChange={set("keywords")} />
        <button disabled={loading} className="md:col-span-5 bg-indigo-600 hover:bg-indigo-500 rounded-xl py-3 font-semibold disabled:opacity-50">{loading ? "Searching with AI…" : "🔍 Find leads"}</button>
      </form>

      {note && <p className="mt-4 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">⚠️ {note} {source && <span className="text-slate-400">(source: {source})</span>} — Verify every lead before outreach.</p>}

      {leads.length > 0 && (
        <div className="mt-6">
          <div className="flex justify-between items-center"><h2 className="font-semibold text-white">{leads.length} leads</h2>
            <button onClick={exportCsv} className="border border-white/20 rounded-xl px-4 py-2 text-sm">{isPro ? "📥 Export CSV" : "🔒 Export CSV (Pro)"}</button></div>
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            {leads.map((l, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex justify-between"><b className="text-white">{l.company}</b><span className="text-emerald-300 font-bold">AI score {l.score}</span></div>
                <p className="text-sm text-slate-400 mt-1">{l.industry} · {l.location}{l.size ? ` · ${l.size} employees` : ""}{l.website ? ` · ${l.website}` : ""}</p>
                {(l.email || l.phone || l.address) && (
                  <p className="text-sm text-slate-300 mt-1">
                    {l.email && <>✉️ {l.email} </>}
                    {l.phone && <>📞 {l.phone} </>}
                    {l.address && <>📍 {l.address}</>}
                  </p>
                )}
                <p className="text-sm text-slate-300 mt-2">{l.description}</p>
                {l.sourceUrl && (
                  <p className="mt-1 text-xs text-slate-500">Source: <a className="underline text-indigo-300" href={l.sourceUrl} target="_blank" rel="noreferrer">{l.sourceName || "public source"}</a></p>
                )}
                <button onClick={() => genOutreach(l)} className="mt-3 text-sm bg-white/10 hover:bg-white/15 rounded-lg px-3 py-1.5">✉️ AI outreach</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && outreach && (
        <div className="mt-6 rounded-2xl border border-indigo-500/40 bg-indigo-600/10 p-4">
          <div className="flex justify-between"><h3 className="font-semibold text-white">Outreach for {selected.company}</h3><button onClick={() => navigator.clipboard.writeText(outreach)} className="text-sm border border-white/20 rounded-lg px-3 py-1">Copy</button></div>
          <pre className="whitespace-pre-wrap text-sm text-slate-200 mt-3">{outreach}</pre>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-8"><h3 className="font-semibold text-white">Search history (this device)</h3>
          <ul className="text-sm text-slate-400 mt-2 space-y-1">{history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString()} — {h.industry || "Any industry"} · {h.location || "Any location"} · {h.count} leads</li>)}</ul></div>
      )}
    </div>
  );
}
