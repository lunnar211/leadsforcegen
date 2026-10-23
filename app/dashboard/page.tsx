"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { type Lead } from "@/lib/types";
import { supabase } from "@/lib/supabaseClient";

type HistoryItem = { at: string; industry: string; location: string; count: number };
type UsageState = { configured: boolean; plan: string; used: number; limit: number; remaining: number };
type Toast = { kind: "success" | "error"; text: string } | null;

// Plan and usage come ONLY from the server (/api/usage, backed by Supabase
// + the consume_daily_quota Postgres function). This page displays them;
// it never decides them. Search history below is device-local display data.
export default function Dashboard() {
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [form, setForm] = useState({ leadType: "B2B companies", industry: "", location: "", size: "11-50", keywords: "" });
  const [fieldErrors, setFieldErrors] = useState<{ industry?: string; location?: string }>({});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [note, setNote] = useState(""); const [source, setSource] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("leadsforcegen_history") || "[]"); } catch { return []; }
  });
  const [outreach, setOutreach] = useState(""); const [selected, setSelected] = useState<Lead | null>(null);

  const showToast = useCallback((kind: "success" | "error", text: string) => {
    setToast({ kind, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("success", `${label} copied`);
    } catch {
      showToast("error", "Copy failed — select and copy it manually");
    }
  }, [showToast]);

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
    } catch { /* leave usage null; UI shows a loading state */ }
  }, [authHeaders]);

  useEffect(() => {
    (async () => { await loadUsage(); })();
  }, [loadUsage]);

  const isPro = usage?.plan === "pro";

  async function runSearch() {
    const errs: typeof fieldErrors = {};
    if (!form.industry.trim() && !form.leadType.trim()) errs.industry = "Enter an industry or lead type — e.g. dentists.";
    if (!form.location.trim()) errs.location = "Enter a location — e.g. Dubai or Kathmandu.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setSearchError("");
    setSearched(false);
    // The server budget is 60s; give the request a little slack beyond it
    // so real server errors surface instead of a client-side cutoff.
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), 80_000);
    try {
      const res = await fetch("/api/ai/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(form),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSearchError(data.error || "Search failed. Please try again.");
        setLeads([]);
        if (data.usage) setUsage(data.usage);
        showToast("error", data.error || "Search failed. Please try again.");
        return;
      }
      const results: Lead[] = data.leads || [];
      setLeads(results); setNote(data.note || ""); setSource(data.source || "");
      setSearched(true);
      if (data.usage) setUsage(data.usage); else await loadUsage();
      const item = { at: new Date().toISOString(), industry: form.industry, location: form.location, count: results.length };
      const hist = [item, ...history].slice(0, 20); setHistory(hist); localStorage.setItem("leadsforcegen_history", JSON.stringify(hist));
      showToast("success", results.length ? `Found ${results.length} leads.` : "Search finished — no matches this time.");
      if (supabase) {
        try {
          const { data: u } = await supabase.auth.getUser();
          if (u.user) {
            await supabase.from("searches").insert({ user_id: u.user.id, industry: form.industry, location: form.location, keywords: form.keywords, result_count: results.length });
            await supabase.from("leads").insert(results.map(l => ({ user_id: u.user.id, company: l.company, industry: l.industry, location: l.location, size: l.size, website: l.website, description: l.description, score: l.score })));
          }
        } catch {}
      }
    } catch (err) {
      // Name the failure honestly: a timeout is not the user's connection,
      // and an offline device is not the server's fault.
      const msg = err instanceof DOMException && err.name === "AbortError"
        ? "The search took too long — the public data sources are slow right now. Try again, or use a more specific city or industry."
        : typeof navigator !== "undefined" && !navigator.onLine
          ? "You appear to be offline. Check your connection and try again."
          : "Couldn't reach the search service just now. Please try again in a moment.";
      setSearchError(msg);
      showToast("error", msg);
    } finally { clearTimeout(killer); setLoading(false); }
  }

  function search(e: React.FormEvent) {
    e.preventDefault();
    void runSearch();
  }

  // One-click website scrape: paste a business website, get the lead it
  // publishes on its own pages (POST /api/leads/from-url). The extracted
  // lead is prepended to the current results so it can be exported with
  // everything else.
  async function runScrape() {
    const target = siteUrl.trim();
    if (!target) { showToast("error", "Paste a business website address first."); return; }
    setScraping(true);
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), 45_000);
    try {
      const res = await fetch("/api/leads/from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ url: target }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast("error", data.error || "Couldn't extract a lead from that website."); return; }
      const lead = (data.leads || [])[0] as Lead | undefined;
      if (!lead) { showToast("error", "No lead could be extracted from that website."); return; }
      setLeads((prev) => [lead, ...prev]);
      setNote(data.note || ""); setSource(data.source || "");
      setSearched(true);
      if (data.usage) setUsage(data.usage); else await loadUsage();
      if (supabase) {
        try {
          const { data: u } = await supabase.auth.getUser();
          if (u.user) {
            await supabase.from("leads").insert([{ user_id: u.user.id, company: lead.company, industry: lead.industry, location: lead.location, size: lead.size, website: lead.website, description: lead.description, score: lead.score }]);
          }
        } catch {}
      }
      showToast("success", `Lead extracted: ${lead.company}.`);
    } catch (err) {
      const msg = err instanceof DOMException && err.name === "AbortError"
        ? "That website took too long to read. Try again in a moment."
        : "Couldn't reach the extraction service just now. Please try again.";
      showToast("error", msg);
    } finally { clearTimeout(killer); setScraping(false); }
  }

  const EXPORT_COLS = ["company", "industry", "location", "size", "website", "email", "phone", "address", "socials", "opening_hours", "score", "source_url", "description"] as const;
  const exportRows = () => leads.map(l => ({
    company: l.company, industry: l.industry, location: l.location, size: l.size, website: l.website,
    email: l.email || "", phone: l.phone || "", address: l.address || "", socials: (l.socials || []).join("; "),
    opening_hours: l.hours || "", score: l.score,
    source_url: l.sourceUrl || "", description: l.description,
  }));

  function download(blob: Blob, filename: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function gateExport(format: string): boolean {
    if (isPro) return true;
    showToast("error", `${format} export is a Pro feature. Upgrade to Pro to export.`);
    return false;
  }

  function exportCsv() {
    if (!gateExport("CSV")) return;
    const rows = exportRows();
    const csv = [[...EXPORT_COLS].join(","), ...rows.map(r => EXPORT_COLS.map(c => `"${String(r[c]).replaceAll('"', '""')}"`).join(","))].join("\n");
    download(new Blob([csv], { type: "text/csv" }), "leadsforcegen-leads.csv");
    showToast("success", "CSV downloaded.");
  }

  function exportJson() {
    if (!gateExport("JSON")) return;
    download(new Blob([JSON.stringify(exportRows(), null, 2)], { type: "application/json" }), "leadsforcegen-leads.json");
    showToast("success", "JSON downloaded.");
  }

  async function exportXlsx() {
    if (!gateExport("Excel")) return;
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(exportRows(), { header: [...EXPORT_COLS] });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leads");
      XLSX.writeFile(wb, "leadsforcegen-leads.xlsx");
      showToast("success", "Excel file downloaded.");
    } catch { showToast("error", "Excel export failed to load. Try CSV instead."); }
  }

  async function exportPdf() {
    if (!gateExport("PDF")) return;
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text("LeadsForceGen — Leads export", 14, 14);
      autoTable(doc, {
        startY: 20,
        head: [["Company", "Industry", "Location", "Website", "Email", "Phone", "Score"]],
        body: exportRows().map(r => [r.company, r.industry, r.location, r.website, r.email, r.phone, String(r.score)]),
        styles: { fontSize: 8 },
      });
      doc.save("leadsforcegen-leads.pdf");
      showToast("success", "PDF downloaded.");
    } catch { showToast("error", "PDF export failed to load. Try CSV instead."); }
  }

  async function genOutreach(lead: Lead) {
    setSelected(lead); setOutreach("Generating…");
    const res = await fetch("/api/ai/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) });
    const data = await res.json(); setOutreach(data.message || "");
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const usedPct = usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:py-10">
      <h1 className="text-3xl font-bold text-fg">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">Find real businesses from public sources, scored and ready to verify.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[380px_1fr] lg:items-start">
        {/* Left column: quota card + search form */}
        <div className="space-y-4 lg:sticky lg:top-24">
          {/* Plan / quota — one clean card */}
          <section className="card p-5" aria-label="Plan and daily usage">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-fg">
                {usage === null ? "Your plan" : isPro ? "Pro plan" : "Free plan"}
              </h2>
              <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted">
                {usage === null ? "Loading…" : (usage.plan || "free").toUpperCase()}
              </span>
            </div>
            {usage === null ? (
              <div className="skeleton mt-4 h-5 w-3/4" aria-hidden="true" />
            ) : !usage.configured ? (
              <p className="mt-3 text-sm text-muted">Demo mode — server quotas activate when the database is connected.</p>
            ) : (
              <>
                <p className="mt-3 text-sm text-fg">
                  <b>{usage.used} / {usage.limit}</b> leads used today
                  {isPro && <span className="text-muted"> (fair-use limit)</span>}
                </p>
                <div
                  className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface border border-border"
                  role="progressbar" aria-valuenow={usage.used} aria-valuemin={0} aria-valuemax={usage.limit}
                  aria-label={`${usage.used} of ${usage.limit} leads used today`}
                >
                  <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${usedPct}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted">{usage.remaining} remaining today · resets at midnight UTC</p>
              </>
            )}
            {!isPro && (
              <Link href="/checkout" className="btn-primary btn-block mt-4">Upgrade to Pro</Link>
            )}
          </section>

          {/* Search form */}
          <form onSubmit={search} className="card space-y-4 p-5" aria-label="Lead search" noValidate>
            <div>
              <label className="label" htmlFor="f-leadtype">Lead type</label>
              <input id="f-leadtype" className="input" placeholder="e.g. Restaurants" value={form.leadType} onChange={set("leadType")} autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="f-industry">Industry</label>
              <input
                id="f-industry" className="input" placeholder="e.g. dentists" value={form.industry} onChange={set("industry")}
                autoComplete="off" aria-invalid={Boolean(fieldErrors.industry)}
                aria-describedby={fieldErrors.industry ? "f-industry-error" : undefined}
              />
              {fieldErrors.industry && <p className="field-error" id="f-industry-error" role="alert">{fieldErrors.industry}</p>}
            </div>
            <div>
              <label className="label" htmlFor="f-location">Location</label>
              <input
                id="f-location" className="input" placeholder="e.g. Dubai" value={form.location} onChange={set("location")}
                autoComplete="off" aria-invalid={Boolean(fieldErrors.location)}
                aria-describedby={fieldErrors.location ? "f-location-error" : undefined}
              />
              {fieldErrors.location && <p className="field-error" id="f-location-error" role="alert">{fieldErrors.location}</p>}
            </div>
            <div>
              <label className="label" htmlFor="f-size">Company size</label>
              <select id="f-size" className="input" value={form.size} onChange={set("size")}>
                <option>1-10</option><option>11-50</option><option>51-200</option><option>201-1000</option><option>1000+</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-keywords">Keywords <span className="font-normal text-muted">(optional)</span></label>
              <input id="f-keywords" className="input" placeholder="e.g. family owned" value={form.keywords} onChange={set("keywords")} autoComplete="off" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary btn-block" aria-busy={loading}>
              {loading && <span className="spinner" aria-hidden="true" />}
              {loading ? "Searching…" : "🔍 Find leads"}
            </button>
          </form>

          {/* One-click website scrape */}
          <div className="card space-y-3 p-5">
            <div>
              <h2 className="font-semibold text-fg">Scrape a website</h2>
              <p className="mt-1 text-sm text-muted">Paste any business website — get the contacts it publishes on its own pages, in one click.</p>
            </div>
            <div>
              <label className="label" htmlFor="f-siteurl">Website</label>
              <input
                id="f-siteurl" className="input" placeholder="e.g. some-dental-clinic.com" value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)} autoComplete="off" inputMode="url"
              />
            </div>
            <button type="button" onClick={() => void runScrape()} disabled={scraping} className="btn-ghost btn-block" aria-busy={scraping}>
              {scraping && <span className="spinner" aria-hidden="true" />}
              {scraping ? "Reading website…" : "🌐 Extract lead from website"}
            </button>
          </div>
        </div>

        {/* Right column: results, outreach, history */}
        <div className="min-w-0">
          {note && !searchError && (source === "sample" ? (
            <p className="rounded-[var(--radius)] border border-warning bg-warning-bg p-3 text-sm text-warning">
              ⚠️ {note} (source: sample) — Verify every lead before outreach.
            </p>
          ) : (
            <p className="rounded-[var(--radius)] border border-success bg-success-bg p-3 text-sm text-success">
              ✅ {note} — Verify every lead before outreach.
            </p>
          ))}

          {searchError && (
            <div className="card border-danger p-5" role="alert">
              <h2 className="font-semibold text-danger">Search didn&apos;t finish</h2>
              <p className="mt-1 text-sm text-muted">{searchError}</p>
              <button type="button" onClick={() => void runSearch()} className="btn-ghost mt-3">Try again</button>
            </div>
          )}

          <section aria-live="polite" aria-busy={loading} className="mt-1">
            {loading && (
              <div className="grid gap-4 sm:grid-cols-2" aria-label="Loading results">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="card space-y-3 p-5">
                    <div className="skeleton h-5 w-2/3" />
                    <div className="skeleton h-4 w-full" />
                    <div className="skeleton h-4 w-5/6" />
                    <div className="skeleton h-10 w-28" />
                  </div>
                ))}
              </div>
            )}

            {!loading && leads.length > 0 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-fg">{leads.length} leads</h2>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Export leads">
                    <button onClick={exportCsv} className="btn-ghost !min-h-[44px] text-sm">{isPro ? "📥 CSV" : "🔒 CSV (Pro)"}</button>
                    <button onClick={() => void exportXlsx()} className="btn-ghost !min-h-[44px] text-sm">{isPro ? "📊 Excel" : "🔒 Excel (Pro)"}</button>
                    <button onClick={() => void exportPdf()} className="btn-ghost !min-h-[44px] text-sm">{isPro ? "🧾 PDF" : "🔒 PDF (Pro)"}</button>
                    <button onClick={exportJson} className="btn-ghost !min-h-[44px] text-sm">{isPro ? "{} JSON" : "🔒 JSON (Pro)"}</button>
                  </div>
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {leads.map((l, i) => (
                    <article key={i} className="card p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-fg break-words">{l.company}</h3>
                        <span className={`flex-none rounded-full px-2.5 py-1 text-xs font-bold ${l.score >= 70 ? "bg-success-bg text-success" : l.score >= 40 ? "bg-warning-bg text-warning" : "bg-danger-bg text-danger"}`}>Score {l.score}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted break-words">{l.industry} · {l.location}{l.size ? ` · ${l.size} employees` : ""}{l.website ? ` · ${l.website}` : ""}</p>
                      {(l.email || l.phone || l.address || l.hours) && (
                        <p className="mt-2 text-sm text-fg break-words">
                          {l.email && (
                            <span className="inline-flex flex-wrap items-center gap-x-2">
                              ✉️ <a href={`mailto:${l.email}`} className="text-accent-text underline">{l.email}</a>
                              <button type="button" onClick={() => void copyText(l.email!, "Email")} className="text-xs text-muted underline" aria-label={`Copy email ${l.email}`}>copy</button>
                              <br />
                            </span>
                          )}
                          {l.phone && (
                            <span className="inline-flex flex-wrap items-center gap-x-2">
                              📞 <a href={`tel:${l.phone.replace(/[^+\d]/g, "")}`} className="text-accent-text underline">{l.phone}</a>
                              <button type="button" onClick={() => void copyText(l.phone!, "Phone")} className="text-xs text-muted underline" aria-label={`Copy phone ${l.phone}`}>copy</button>
                              <br />
                            </span>
                          )}
                          {l.address && <>📍 {l.address}<br /></>}
                          {l.hours && <>🕐 {l.hours}</>}
                        </p>
                      )}
                      {l.socials && l.socials.length > 0 && (
                        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {l.socials.map((s) => {
                            const host = s.replace("https://", "").split("/")[0];
                            const label = host.includes("facebook") ? "Facebook" : host.includes("instagram") ? "Instagram" : host.includes("linkedin") ? "LinkedIn" : host.includes("youtube") ? "YouTube" : host.includes("tiktok") ? "TikTok" : "X";
                            return <a key={s} href={s} target="_blank" rel="noreferrer" className="text-accent-text underline">{label}</a>;
                          })}
                        </p>
                      )}
                      <p className="mt-2 text-sm text-muted break-words">{l.description}</p>
                      {l.sourceUrl && (
                        <p className="mt-2 text-xs text-muted">
                          Source: <a className="text-accent-text underline break-all" href={l.sourceUrl} target="_blank" rel="noreferrer">{l.sourceName || "public source"}</a>
                        </p>
                      )}
                      <button onClick={() => genOutreach(l)} className="btn-ghost mt-3 text-sm">✉️ AI outreach</button>
                    </article>
                  ))}
                </div>
              </>
            )}

            {!loading && !searchError && searched && leads.length === 0 && (
              <div className="card p-6 text-center">
                <p className="text-3xl" aria-hidden="true">🔎</p>
                <h2 className="mt-2 font-semibold text-fg">No leads found for that search</h2>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                  Try a broader industry (e.g. “restaurants” instead of “vegan restaurants”) or a bigger city nearby.
                </p>
              </div>
            )}
          </section>

          {selected && outreach && (
            <section className="card mt-4 p-5" aria-label="AI outreach message">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold text-fg">Outreach for {selected.company}</h3>
                <button
                  onClick={() => { navigator.clipboard.writeText(outreach); showToast("success", "Outreach copied to clipboard."); }}
                  className="btn-ghost text-sm"
                >
                  Copy
                </button>
              </div>
              <pre className="mt-3 whitespace-pre-wrap break-words text-sm text-fg">{outreach}</pre>
            </section>
          )}

          <section className="mt-8" aria-label="Search history">
            <h2 className="text-lg font-semibold text-fg">Search history <span className="text-sm font-normal text-muted">(this device)</span></h2>
            {history.length === 0 ? (
              <div className="card mt-3 p-6 text-center">
                <p className="font-medium text-fg">No searches yet</p>
                <p className="mt-1 text-sm text-muted">Your recent searches will appear here after your first Find leads.</p>
              </div>
            ) : (
              <ul className="mt-3 space-y-3">
                {history.map((h, i) => (
                  <li key={i} className="card flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm">
                    <span className="font-medium text-fg break-words">{h.industry || "Any industry"} · {h.location || "Any location"}</span>
                    <span className="text-muted">{h.count} leads</span>
                    <span className="ml-auto text-xs text-muted">{new Date(h.at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-[var(--radius)] p-4 text-sm font-medium shadow-lg sm:inset-x-auto sm:right-6 sm:mx-0 ${
            toast.kind === "success" ? "bg-success-bg text-success border border-success" : "bg-danger-bg text-danger border border-danger"
          }`}
        >
          {toast.text}
          <button type="button" onClick={() => setToast(null)} className="ml-3 underline" aria-label="Dismiss notification">Dismiss</button>
        </div>
      )}
    </div>
  );
}
