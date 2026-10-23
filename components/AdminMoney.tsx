"use client";
import { useCallback, useEffect, useState } from "react";

// Money management (owner-only). Every number comes from
// /api/admin/money, computed server-side from the payments ledger —
// captured only after server verification or owner approval. No sample
// numbers are ever shown for money: if the API is unavailable, this
// section says so instead of inventing figures.
type Sums = Record<string, number>;
type PaymentRow = { id: string; email: string | null; gateway: string; amount: number; currency: string; status: string; method: string | null; months: number | null; created_at: string };
type MoneyData = {
  captured: Sums; capturedThisMonth: Sums; refunded: Sums;
  pending: { count: number; sums: Sums };
  capturedCount: number; rejectedCount: number;
  byGateway: { gateway: string; capturedCount: number; capturedSums: Sums; pendingCount: number }[];
  subscriptions: { email: string; plan: string; gateway: string; current_period_end: string | null }[];
  payments: PaymentRow[];
};

function fmtSums(sums: Sums): string {
  const parts = Object.entries(sums).map(([c, a]) => `${c} ${a.toLocaleString()}`);
  return parts.length ? parts.join(" · ") : "—";
}

const FILTERS = ["all", "captured", "pending", "rejected", "refunded"] as const;

export default function AdminMoney() {
  const [data, setData] = useState<MoneyData | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/money");
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) { setData(d.data as MoneyData); setFailed(false); }
      else setFailed(true);
    } catch { setFailed(true); }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

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

  const rows = data ? data.payments.filter((p) => filter === "all" || p.status === filter) : [];

  return (
    <section aria-label="Money management">
      <h2 className="font-semibold text-fg mt-10">💰 Money management</h2>
      <p className="mt-1 text-sm text-muted">
        Revenue counts only <b className="text-fg">captured</b> payments — money verified server-side (gateway webhook/signature, or your approval of a manual proof).
        Amounts are never mixed across currencies.
      </p>
      {msg && <p className="mt-2 text-sm text-fg" role="status">{msg}</p>}

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
              <p className="p-5 text-sm text-muted">No payments yet. When customers pay (Lemon Squeezy, or manual eSewa/Khalti/bank you approve), the per-gateway breakdown appears here.</p>
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
              <p className="p-5 text-sm text-muted">No active subscriptions yet.</p>
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
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter payments by status">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`${filter === f ? "btn-primary" : "btn-ghost"} px-3 py-1.5 text-xs`} aria-pressed={filter === f}>
                {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="card mt-3 overflow-x-auto">
            {rows.length === 0 ? (
              <p className="p-5 text-sm text-muted">No {filter === "all" ? "" : `${filter} `}payments to show.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface text-left text-muted"><tr><th className="p-3">Date</th><th className="p-3">Email</th><th className="p-3">Gateway</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
                <tbody>{rows.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-3 whitespace-nowrap">{String(p.created_at).slice(0, 16).replace("T", " ")}</td>
                    <td className="p-3 text-fg break-all">{p.email || "—"}</td>
                    <td className="p-3">{p.gateway}{p.method ? ` · ${p.method}` : ""}{p.months ? ` · ${p.months} mo` : ""}</td>
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
