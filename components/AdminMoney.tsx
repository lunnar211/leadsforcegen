"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Money management (owner-only). Every number comes from
// /api/admin/money, computed server-side from the payments ledger —
// captured only after server verification or owner approval. No sample
// numbers are ever shown for money: if the API is unavailable, this
// section says so instead of inventing figures.
//
// Filters (status, gateway, currency/market, buyer email, date range)
// are applied server-side: the totals, gateway table and ledger all
// follow the active filters, so the owner can slice revenue
// country-wise (NPR = Nepal, USD = worldwide gateway), gateway-wise
// and user-wise.
type Sums = Record<string, number>;
type PaymentRow = { id: string; email: string | null; gateway: string; amount: number; currency: string; status: string; method: string | null; months: number | null; created_at: string };
type MoneyData = {
  captured: Sums; capturedThisMonth: Sums; refunded: Sums;
  pending: { count: number; sums: Sums };
  capturedCount: number; rejectedCount: number;
  byGateway: { gateway: string; capturedCount: number; capturedSums: Sums; pendingCount: number }[];
  subscriptions: { email: string; plan: string; gateway: string; current_period_end: string | null }[];
  payments: PaymentRow[];
  filtersApplied: boolean;
  gateways: string[];
  currencies: string[];
};

function fmtSums(sums: Sums): string {
  const parts = Object.entries(sums).map(([c, a]) => `${c} ${a.toLocaleString()}`);
  return parts.length ? parts.join(" · ") : "—";
}

function market(p: PaymentRow): string {
  if (p.currency === "NPR") return "Nepal";
  if (p.gateway === "manual") return "Nepal (manual)";
  return "Worldwide";
}

const STATUSES = ["all", "captured", "pending", "rejected", "refunded"] as const;

export default function AdminMoney() {
  const [data, setData] = useState<MoneyData | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [gateway, setGateway] = useState("");
  const [currency, setCurrency] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (gateway) params.set("gateway", gateway);
    if (currency) params.set("currency", currency);
    if (q.trim()) params.set("q", q.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    try {
      const res = await fetch(`/api/admin/money${qs ? `?${qs}` : ""}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) { setData(d.data as MoneyData); setFailed(false); }
      else setFailed(true);
    } catch { setFailed(true); }
  }, [status, gateway, currency, q, from, to]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { void load(); }, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [load]);

  function clearFilters() {
    setStatus("all"); setGateway(""); setCurrency(""); setQ(""); setFrom(""); setTo("");
  }

  async function refund(p: PaymentRow) {
    if (!window.confirm(`Mark this payment refunded?\n\n${p.currency} ${Number(p.amount).toLocaleString()} — ${p.email || "unknown buyer"}\n\nThis records the refund in your books. You still return the money yourself via ${p.method || "the original method"} — manual payments have no automatic refund.`)) return;
    setBusy(p.id);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, action: "refund" }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok && d.ok ? "Marked refunded." : d.error || "Refund action failed.");
      if (res.ok) await load();
    } catch { setMsg("Refund action failed — network problem."); }
    finally { setBusy(""); }
  }

  const rows = data?.payments || [];
  const inputCls = "rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm text-fg";

  return (
    <section aria-label="Money management">
      <h2 className="font-semibold text-fg mt-10">💰 Money management</h2>
      <p className="mt-1 text-sm text-muted">
        Revenue counts only <b className="text-fg">captured</b> payments — money verified server-side (gateway webhook/signature, or your approval of a manual proof).
        Amounts are never mixed across currencies.
      </p>
      {msg && <p className="mt-2 text-sm text-fg" role="status">{msg}</p>}

      <div className="card mt-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted">Gateway
            <select value={gateway} onChange={(e) => setGateway(e.target.value)} className={`${inputCls} mt-1 block`} aria-label="Filter by gateway">
              <option value="">All gateways</option>
              {(data?.gateways || ["lemonsqueezy", "manual"]).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">Currency / market
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${inputCls} mt-1 block`} aria-label="Filter by currency (market)">
              <option value="">All currencies</option>
              {(data?.currencies || ["NPR", "USD"]).map((c) => <option key={c} value={c}>{c}{c === "NPR" ? " (Nepal)" : c === "USD" ? " (Worldwide)" : ""}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">Buyer email
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search by email…" className={`${inputCls} mt-1 block`} aria-label="Filter by buyer email" />
          </label>
          <label className="text-xs text-muted">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} mt-1 block`} aria-label="From date" />
          </label>
          <label className="text-xs text-muted">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} mt-1 block`} aria-label="To date" />
          </label>
          <button onClick={clearFilters} className="btn-ghost px-3 py-2 text-xs">Clear filters</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter payments by status">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`${status === s ? "btn-primary" : "btn-ghost"} px-3 py-1.5 text-xs`} aria-pressed={status === s}>
              {s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
          {data?.filtersApplied && <span className="self-center text-xs text-warning">Totals below follow the active filters.</span>}
        </div>
      </div>

      {failed && (
        <div className="card mt-3 p-5">
          <p className="text-sm text-muted">Money data is unavailable right now (admin API or Supabase problem). No figures are shown rather than estimated ones — reload the page to retry.</p>
        </div>
      )}
      {!data && !failed && <div className="card mt-3 p-5"><p className="text-sm text-muted">Loading money data…</p></div>}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <div className="card p-5"><p className="text-sm text-muted">Captured revenue (all time)</p><p className="text-xl font-extrabold text-fg mt-1">{fmtSums(data.captured)}</p><p className="text-xs text-muted mt-1">{data.capturedCount} captured payment{data.capturedCount === 1 ? "" : "s"}</p></div>
            <div className="card p-5"><p className="text-sm text-muted">Captured this month</p><p className="text-xl font-extrabold text-fg mt-1">{fmtSums(data.capturedThisMonth)}</p></div>
            <div className="card p-5"><p className="text-sm text-muted">Pending review</p><p className="text-xl font-extrabold text-fg mt-1">{data.pending.count}</p><p className="text-xs text-muted mt-1">{fmtSums(data.pending.sums)} awaiting your check</p></div>
            <div className="card p-5"><p className="text-sm text-muted">Refunded</p><p className="text-xl font-extrabold text-fg mt-1">{fmtSums(data.refunded)}</p><p className="text-xs text-muted mt-1">{data.rejectedCount} rejected request{data.rejectedCount === 1 ? "" : "s"}</p></div>
          </div>

          <h3 className="font-semibold text-fg mt-6">By gateway</h3>
          <div className="card mt-3 overflow-x-auto">
            {data.byGateway.length === 0 ? (
              <p className="p-5 text-sm text-muted">No payments match. When customers pay (Lemon Squeezy, or manual eSewa/Khalti/bank you approve), the per-gateway breakdown appears here.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface text-left text-muted"><tr><th className="p-3">Gateway</th><th className="p-3">Captured</th><th className="p-3">Captured amount</th><th className="p-3">Pending</th></tr></thead>
                <tbody>{data.byGateway.map((g) => (
                  <tr key={g.gateway} className="border-t border-border">
                    <td className="p-3 text-fg">{g.gateway}</td>
                    <td className="p-3">{g.capturedCount}</td>
                    <td className="p-3 whitespace-nowrap">{fmtSums(g.capturedSums)}</td>
                    <td className="p-3">{g.pendingCount}</td>
                  </tr>))}
                </tbody>
              </table>
            )}
          </div>

          <h3 className="font-semibold text-fg mt-6">Active subscriptions</h3>
          <div className="card mt-3 overflow-x-auto">
            {data.subscriptions.length === 0 ? (
              <p className="p-5 text-sm text-muted">No active subscriptions match.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface text-left text-muted"><tr><th className="p-3">Email</th><th className="p-3">Plan</th><th className="p-3">Gateway</th><th className="p-3">Period ends</th></tr></thead>
                <tbody>{data.subscriptions.map((s, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-3 text-fg break-all">{s.email}</td>
                    <td className="p-3">{s.plan}</td>
                    <td className="p-3">{s.gateway}</td>
                    <td className="p-3 whitespace-nowrap">{s.current_period_end ? String(s.current_period_end).slice(0, 10) : "—"}</td>
                  </tr>))}
                </tbody>
              </table>
            )}
          </div>

          <h3 className="font-semibold text-fg mt-6">Payments ledger</h3>
          <div className="card mt-3 overflow-x-auto">
            {rows.length === 0 ? (
              <p className="p-5 text-sm text-muted">No payments match the active filters.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface text-left text-muted"><tr><th className="p-3">Date</th><th className="p-3">Email</th><th className="p-3">Gateway</th><th className="p-3">Market</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
                <tbody>{rows.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-3 whitespace-nowrap">{String(p.created_at).slice(0, 16).replace("T", " ")}</td>
                    <td className="p-3 text-fg break-all">{p.email || "—"}</td>
                    <td className="p-3">{p.gateway}{p.method ? ` · ${p.method}` : ""}{p.months ? ` · ${p.months} mo` : ""}</td>
                    <td className="p-3 whitespace-nowrap">{market(p)}</td>
                    <td className="p-3 whitespace-nowrap">{p.currency} {Number(p.amount).toLocaleString()}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.status === "captured" ? "bg-success-bg text-success" : p.status === "pending" ? "bg-warning-bg text-warning" : "bg-danger-bg text-danger"}`}>{p.status}</span>
                    </td>
                    <td className="p-3">
                      {p.gateway === "manual" && p.status === "captured" ? (
                        <button onClick={() => void refund(p)} disabled={busy === p.id} className="btn-ghost px-2 py-1 text-xs">{busy === p.id ? "Saving…" : "Mark refunded"}</button>
                      ) : <span className="text-xs text-muted">—</span>}
                    </td>
                  </tr>))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </section>
  );
}
