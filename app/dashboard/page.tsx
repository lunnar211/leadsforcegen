"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FREE_DAILY_LEAD_LIMIT, type Lead, type Plan } from "@/lib/types";
import { supabase } from "@/lib/supabaseClient";

type HistoryItem = { at: string; industry: string; location: string; count: number };

function todayKey() { return new Date().toISOString().slice(0, 10); }

export default function Dashboard() {
  const [plan, setPlan] = useState<Plan>("free");
  const [used, setUsed] = useState(0);
  const [form, setForm] = useState({ leadType: "B2B companies", industry: "", location: "", size: "11-50", keywords: "" });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [note, setNote] = useState(""); const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [outreach, setOutreach] = useState(""); const [selected, setSelected] = useState<Lead | null>(null);

  useEffect(() => {
    const p = (localStorage.getItem("leadsforcegen_plan") as Plan) || "free"; setPlan(p);
    if (localStorage.getItem("leadsforcegen_usage_date") !== todayKey()) { localStorage.setItem("leadsforcegen_usage_date", todayKey()); localStorage.setItem("leadsforcegen_usage_count", "0"); setUsed(0); }
    else setUsed(Number(localStorage.getItem("leadsforcegen_usage_count") || 0));
    try { setHistory(JSON.parse(localStorage.getItem("leadsforcegen_history") || "[]")); } catch {}
  }, []);

  const remaining = plan === "pro" ? Infinity : Math.max(0, FREE_DAILY_LEAD_LIMIT - used);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (plan !== "pro" && remaining <= 0) { setNote("Free daily limit reached. Upgrade to Pro for unlimited leads."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      let results: Lead[] = data.leads || [];
      if (plan !== "pro") results = results.slice(0, remaining as number);
      setLeads(results); setNote(data.note || ""); setSource(data.source || "");
      const newUsed = used + results.length;
      if (plan !== "pro") { setUsed(newUsed); localStorage.setItem("leadsforcegen_usage_count", String(newUsed)); }
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
    if (plan !== "pro") { alert("CSV export is a Pro feature. Upgrade to Pro for unlimited leads + CSV export."); return; }
    const rows = [["company","industry","location","size","website","score","description"], ...leads.map(l => [l.company,l.industry,l.location,l.size,l.website,String(l.score),l.description])];
    const csv = rows.map(r => r.map(c => `"${String(c).replaceAll('"','""')}"`).join(",")).join("\n");
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
          <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1">Plan: <b className="text-white">{plan.toUpperCase()}</b></span>
          <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1">{plan === "pro" ? "Unlimited leads" : `${remaining} / ${FREE_DAILY_LEAD_LIMIT} free leads left today`}</span>
          <button onClick={() => { const p = plan === "pro" ? "free" : "pro"; setPlan(p); localStorage.setItem("leadsforcegen_plan", p); }} className="text-xs border border-white/20 rounded-full px-3 py-1" title="Demo toggle only — real Pro comes from a verified payment">Demo: toggle plan</button>
          {plan !== "pro" && <Link href="/checkout" className="bg-indigo-600 px-3 py-1.5 rounded-full font-semibold">Upgrade to Pro</Link>}
        </div>
      </div>

      <form onSubmit={search} className="grid md:grid-cols-5 gap-3 mt-6 bg-white/5 border border-white/10 rounded-2xl p-4">
        <input className="rounded-xl bg-slate-900 border border-white/10 px-3 py-2.5" placeholder="Lead type (e.g. Restaurants)" value={form.leadType} onChange={set("leadType")} />
        <input className="rounded-xl bg-slate-900 border border-white/10 px-3 py-2.5" placeholder="Industry" value={form.industry} onChange={set("industry")} />
        <input className="rounded-xl bg-slate-900 border border-white/10 px-3 py-2.5" placeholder="Location" value={form.location} onChange={set("location")} />
        <select className="rounded-xl bg-slate-900 border border-white/10 px-3 py-2.5" value={form.size} onChange={set("size")}><option>1-10</option><option>11-50</option><option>51-200</option><option>201-1000</option><option>1000+</option></select>
        <input className="rounded-xl bg-slate-900 border border-white/10 px-3 py-2.5" placeholder="Keywords" value={form.keywords} onChange={set("keywords")} />
        <button disabled={loading} className="md:col-span-5 bg-indigo-600 hover:bg-indigo-500 rounded-xl py-3 font-semibold disabled:opacity-50">{loading ? "Searching with AI…" : "🔍 Find leads"}</button>
      </form>

      {note && <p className="mt-4 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">⚠️ {note} {source && <span className="text-slate-400">(source: {source})</span>} — Verify every lead before outreach.</p>}

      {leads.length > 0 && (
        <div className="mt-6">
          <div className="flex justify-between items-center"><h2 className="font-semibold text-white">{leads.length} leads</h2>
            <button onClick={exportCsv} className="border border-white/20 rounded-xl px-4 py-2 text-sm">{plan === "pro" ? "📥 Export CSV" : "🔒 Export CSV (Pro)"}</button></div>
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            {leads.map((l, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex justify-between"><b className="text-white">{l.company}</b><span className="text-emerald-300 font-bold">AI score {l.score}</span></div>
                <p className="text-sm text-slate-400 mt-1">{l.industry} · {l.location} · {l.size} employees{l.website ? ` · ${l.website}` : ""}</p>
                <p className="text-sm text-slate-300 mt-2">{l.description}</p>
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
