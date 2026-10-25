"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Lead } from "@/lib/types";
import { supabase } from "@/lib/supabaseClient";
import SupportCard from "@/components/SupportCard";
import MfaCard from "@/components/MfaCard";
import ProPanel from "@/components/ProPanel";
import areaData from "@/lib/data/areas.json";

// Country first, then exact area: picking a country narrows the area
// suggestions to places we actually hold businesses for, and every
// other country still accepts a free-typed city or neighbourhood —
// the search geocodes worldwide, so no country is ever a dead end.
const COUNTRIES = ["Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"];
// Top localities per covered country, measured from the stored
// datasets (lib/data/areas.json, regenerated from data/*.csv).
const AREAS: Record<string, string[]> = areaData as Record<string, string[]>;

type HistoryItem = { at: string; industry: string; location: string; count: number };
type UsageState = { configured: boolean; plan: string; used: number; limit: number; remaining: number; email?: string };
type Toast = { kind: "success" | "error"; text: string } | null;

// Plan and usage come ONLY from the server (/api/usage, backed by Supabase
// + the consume_daily_quota Postgres function). This page displays them;
// it never decides them. Search history below is device-local display data.
// Guest view: NO search UI at all — just the product overview and the
// sign-in gate. Searching is a members feature; the server already 401s
// anonymous searches, and since this change the page never even renders
// the form for a signed-out visitor (no flash of it while the session
// check runs either — the page shows a loading card until auth is known).
function GuestOverview() {
  const points = [
    "1.1M+ real businesses — UAE · Nepal · New York · Seattle · Karachi · Dhaka, more added regularly",
    "Phone, email, website and social links for every lead, each with its source",
    "Free plan: 30 leads every day · Pro: unlimited* searches + Excel export",
  ];
  return (
    <section className="card mt-6 p-6 sm:p-8" aria-label="Sign in to search leads">
      <span className="inline-flex items-center justify-center rounded-[10px] p-[9px] text-white shadow-md" style={{ background: "var(--accent)" }} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
      </span>
      <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-fg">Lead search is for members</h2>
      <p className="mt-2 max-w-[560px] text-sm leading-relaxed text-muted">
        You are browsing as a guest, so this page shows the overview only. Sign in — free — and the full search unlocks instantly: real businesses with contact details, scored and ready to export.
      </p>
      <ul className="mt-5 space-y-2.5">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-sm text-fg">
            <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4.5 12.5 5 5 10-11" /></svg>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/login" className="btn-primary px-6">Log in</Link>
        <Link href="/signup" className="btn-cta px-6">Create free account</Link>
      </div>
      <p className="mt-4 text-xs text-muted">No card needed for the free plan. Your searches and exports stay private to your account.</p>
    </section>
  );
}

export default function Dashboard() {
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [authKnown, setAuthKnown] = useState(false);
  const [form, setForm] = useState({ industry: "", location: "", size: "11-50", keywords: "" });
  const [country, setCountry] = useState("");
  const [area, setArea] = useState("");
  // Country + area compose the searched location ("Kathmandu, Nepal"):
  // the geocoder resolves the exact place, and the stored database
  // answers from its own locality match. Either half alone still works.
  const pickCountry = (v: string) => {
    setCountry(v);
    setForm((f) => ({ ...f, location: [area.trim(), v.trim()].filter(Boolean).join(", ") }));
  };
  const pickArea = (v: string) => {
    setArea(v);
    setForm((f) => ({ ...f, location: [v.trim(), country.trim()].filter(Boolean).join(", ") }));
  };
  const [fieldErrors, setFieldErrors] = useState<{ industry?: string; location?: string }>({});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [note, setNote] = useState(""); const [source, setSource] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [filter, setFilter] = useState<"all" | "email" | "phone" | "website">("all");
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
      if (res.status === 401) { setSignedOut(true); return; }
      if (d.data) { setSignedOut(false); setUsage(d.data as UsageState); }
    } catch { /* leave usage null; UI shows a loading state */ }
    finally { setAuthKnown(true); }
  }, [authHeaders]);

  useEffect(() => {
    (async () => { await loadUsage(); })();
  }, [loadUsage]);

  // MFA enforcement: a session that still owes an authenticator
  // challenge (AAL1 while a verified factor exists → next level AAL2)
  // is bounced to /auth/mfa before it can use the console.
  const router = useRouter();
  useEffect(() => {
    (async () => {
      if (!supabase) return;
      try {
        const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (data && data.currentLevel === "aal1" && data.nextLevel === "aal2") router.replace("/auth/mfa");
      } catch { /* best-effort client guard; server APIs verify the JWT on every call regardless */ }
    })();
  }, [router]);

  const isPro = usage?.plan === "pro";
  // Pro panel tab: rendered ONLY for Pro users (plan comes from
  // /api/usage, never from the client). Free users never see the tab
  // or its contents — they keep the existing "Upgrade to Pro" card.
  const [dashTab, setDashTab] = useState<"search" | "pro">("search");

  // override lets one-tap history re-runs bypass setState timing: the
  // request uses the clicked values immediately, not the next render.
  async function runSearch(override?: { industry: string; location: string }) {
    const industry = (override?.industry ?? form.industry).trim();
    const location = (override?.location ?? form.location).trim();
    const errs: typeof fieldErrors = {};
    if (!industry) errs.industry = "Enter what you are looking for — e.g. dentists, car owners, restaurants.";
    if (!location) errs.location = "Pick a country and an area — e.g. Nepal, then Kathmandu.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setElapsed(0);
    setSearchError("");
    setSearched(false);
    // Honest progress labels: the stages describe what the server may be
    // doing at this elapsed time (database first, then maps/web, then
    // reading business websites) — never a fake completion percentage.
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000);
    // The server budget is 60s; give the request a little slack beyond it
    // so real server errors surface instead of a client-side cutoff.
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), 80_000);
    try {
      const res = await fetch("/api/ai/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ ...form, industry, location }),
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
      const item = { at: new Date().toISOString(), industry, location, count: results.length };
      const hist = [item, ...history].slice(0, 20); setHistory(hist); localStorage.setItem("leadsforcegen_history", JSON.stringify(hist));
      showToast("success", results.length ? `Found ${results.length} leads.` : "Search finished — no matches this time.");
      if (supabase) {
        try {
          const { data: u } = await supabase.auth.getUser();
          if (u.user) {
            await supabase.from("searches").insert({ user_id: u.user.id, industry, location, keywords: form.keywords, result_count: results.length });
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
    } finally { clearTimeout(killer); clearInterval(tick); setElapsed(0); setLoading(false); }
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
    const res = await fetch("/api/ai/outreach", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(lead) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setOutreach("");
      showToast("error", data.error || "Outreach failed. Please try again.");
      if (data.usage) setUsage(data.usage); else void loadUsage();
      return;
    }
    setOutreach(data.message || "");
    void loadUsage();
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const usedPct = usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  // Result filters are a pure view over the leads already found — they
  // never re-query and never cost quota.
  const visibleLeads = filter === "all" ? leads
    : filter === "email" ? leads.filter((l) => l.email)
    : filter === "phone" ? leads.filter((l) => l.phone)
    : leads.filter((l) => l.website);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:py-10">
      <h1 className="text-3xl font-bold text-fg">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">Find real businesses from public sources, scored and ready to verify.</p>

      {!authKnown ? (
        <div className="card mt-6 p-8 text-center" role="status">
          <p className="text-sm text-muted">Loading your dashboard…</p>
        </div>
      ) : signedOut ? (
        <GuestOverview />
      ) : (
      <>
      {isPro && (
        <div className="mt-6 flex gap-2" role="tablist" aria-label="Dashboard sections">
          <button
            type="button" role="tab" aria-selected={dashTab === "search"} onClick={() => setDashTab("search")}
            className="rounded-[var(--radius)] px-4 py-2 text-sm font-semibold"
            style={dashTab === "search" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--fg)" }}
          >
            Lead search
          </button>
          <button
            type="button" role="tab" aria-selected={dashTab === "pro"} onClick={() => setDashTab("pro")}
            className="rounded-[var(--radius)] px-4 py-2 text-sm font-semibold"
            style={dashTab === "pro" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--fg)" }}
          >
            Pro panel
          </button>
        </div>
      )}
      {isPro && dashTab === "pro" ? (
        <div className="mt-6">
          <ProPanel
            usage={usage}
            history={history}
            authHeaders={authHeaders}
            onReRun={(h) => {
              setDashTab("search");
              setCountry(""); setArea("");
              setForm({ ...form, industry: h.industry, location: h.location });
              void runSearch({ industry: h.industry, location: h.location });
            }}
          />
        </div>
      ) : (
      <div className="mt-6 grid gap-4 lg:grid-cols-[380px_1fr] lg:items-start">
        {/* Left column: quota card + search form */}
        <div className="space-y-4 lg:sticky lg:top-24">
          {/* Plan / quota — one clean card */}
          <section className="card p-5" aria-label="Plan and daily usage">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-fg">
                {signedOut ? "Not signed in" : usage === null ? "Your plan" : isPro ? "Pro plan" : "Free plan"}
              </h2>
              <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted">
                {signedOut ? "GUEST" : usage === null ? "Loading…" : (usage.plan || "free").toUpperCase()}
              </span>
            </div>
            {signedOut ? (
              <div className="mt-3">
                <p className="text-sm text-muted">Sign in to search for leads and see your plan. Free accounts get 30 leads a day — no card needed.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link href="/login" className="btn-primary">Log in</Link>
                  <Link href="/signup" className="btn-ghost">Sign up free</Link>
                </div>
              </div>
            ) : usage === null ? (
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
            {!signedOut && !isPro && usage !== null && (
              <Link href="/checkout" className="btn-primary btn-block mt-4">Upgrade to Pro</Link>
            )}
          </section>

          {/* Search form — one field for what the user wants, in their
              own words (the old two-field "Lead type + Industry" split
              confused people: both fed the same search). */}
          <form onSubmit={search} className="card space-y-4 p-5" aria-label="Lead search" noValidate>
            <div>
              <label className="label" htmlFor="f-industry">What are you looking for?</label>
              <input
                id="f-industry" className="input" placeholder="e.g. dentists, car owners, restaurants" value={form.industry} onChange={set("industry")}
                autoComplete="off" aria-invalid={Boolean(fieldErrors.industry)}
                aria-describedby={fieldErrors.industry ? "f-industry-error" : undefined}
              />
              <p className="mt-1 text-xs text-muted">Type anything in plain words — the site understands what you mean.</p>
              {fieldErrors.industry && <p className="field-error" id="f-industry-error" role="alert">{fieldErrors.industry}</p>}
            </div>
            <div>
              <label className="label" htmlFor="f-country">Country</label>
              <select id="f-country" className="input" value={country} onChange={(e) => pickCountry(e.target.value)}>
                <option value="">All countries — or pick one</option>
                {COUNTRIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-area">Exact place / area</label>
              <input
                id="f-area" className="input" list="area-suggestions"
                placeholder={country ? `e.g. ${AREAS[country]?.[0] ?? "a city or neighbourhood"}` : "Pick a country first, or type any city or neighbourhood"}
                value={area} onChange={(e) => pickArea(e.target.value)}
                autoComplete="off" aria-invalid={Boolean(fieldErrors.location)}
                aria-describedby={fieldErrors.location ? "f-location-error" : undefined}
              />
              <datalist id="area-suggestions">
                {(country ? AREAS[country] ?? [] : []).map((a) => (<option key={a} value={a} />))}
              </datalist>
              <p className="mt-1 text-xs text-muted">
                {country && AREAS[country]
                  ? "Areas shown are places we hold businesses for — or type any exact place."
                  : "Type any city, neighbourhood, or exact place — the search works worldwide."}
              </p>
              {form.location && (
                <p className="mt-1 text-xs">
                  Searching in: <span className="font-medium text-fg">{form.location}</span>
                  {" · "}<a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(form.location)}`} target="_blank" rel="noreferrer" className="underline">View area on map</a>
                </p>
              )}
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
              {loading ? "Searching…" : (<><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="mr-2 inline h-4 w-4"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>Find leads</>)}
            </button>
            {loading && (
              <p className="text-center text-xs text-muted" role="status">
                {elapsed < 4
                  ? "Searching the stored database…"
                  : elapsed < 15
                    ? "Checking maps and the web for more…"
                    : "Reading business websites for contacts — this can take up to a minute…"}
              </p>
            )}
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
          {note && !searchError && (source === "sample" || source === "none" ? (
            <p className="rounded-[var(--radius)] border border-warning bg-warning-bg p-3 text-sm text-warning">
              ⚠️ {note}
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
                  <h2 className="text-lg font-semibold text-fg">
                    {filter === "all" ? `${leads.length} leads` : `Showing ${visibleLeads.length} of ${leads.length} leads`}
                  </h2>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Export leads">
                    <button onClick={exportCsv} className="btn-ghost !min-h-[44px] text-sm">{isPro ? "Download CSV" : "CSV (Pro)"}</button>
                    <button onClick={() => void exportXlsx()} className="btn-ghost !min-h-[44px] text-sm">{isPro ? "Download Excel" : "Excel (Pro)"}</button>
                    <button onClick={() => void exportPdf()} className="btn-ghost !min-h-[44px] text-sm">{isPro ? "Download PDF" : "PDF (Pro)"}</button>
                    <button onClick={exportJson} className="btn-ghost !min-h-[44px] text-sm">{isPro ? "Download JSON" : "JSON (Pro)"}</button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter results">
                  {(["all", "email", "phone", "website"] as const).map((f) => (
                    <button
                      key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                      className={`${filter === f ? "btn-primary" : "btn-ghost"} !min-h-[44px] text-sm`}
                    >
                      {f === "all" ? "All leads" : f === "email" ? "Has email" : f === "phone" ? "Has phone" : "Has website"}
                    </button>
                  ))}
                </div>
                {visibleLeads.length === 0 ? (
                  <p className="card mt-3 p-5 text-center text-sm text-muted">
                    No leads in this view match that filter — try “All leads”.
                  </p>
                ) : (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {visibleLeads.map((l, i) => (
                    <article key={i} className="card card-hover p-5">
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
                )}
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

          <SupportCard />

          <MfaCard />

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
                  <li key={i} className="card p-0 text-sm">
                    <button
                      type="button" disabled={loading}
                      onClick={() => { setCountry(""); setArea(""); setForm({ ...form, industry: h.industry, location: h.location }); void runSearch({ industry: h.industry, location: h.location }); }}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-4 text-left"
                      aria-label={`Re-run search for ${h.industry || "any industry"} in ${h.location || "any location"}`}
                    >
                      <span className="font-medium text-fg break-words">{h.industry || "Any industry"} · {h.location || "Any location"}</span>
                      <span className="text-muted">{h.count} leads</span>
                      <span className="text-xs text-accent-text underline">↻ Re-run</span>
                      <span className="ml-auto text-xs text-muted">{new Date(h.at).toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      )}
      </>
      )}

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
