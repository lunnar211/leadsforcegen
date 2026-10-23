"use client";
import { useCallback, useEffect, useState } from "react";

type Coupon = { id: string; code: string; percent_off: number; active: boolean; max_uses: number | null; used_count: number; created_at: string };

export default function CouponsManager() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [activated, setActivated] = useState(true);
  const [code, setCode] = useState("");
  const [pct, setPct] = useState("20");
  const [maxUses, setMaxUses] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/coupons");
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) { setCoupons(d.data.coupons || []); setActivated(d.data.activated !== false); }
    } catch { /* keep empty */ }
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok && d.ok ? "Saved." : d.error || "Action failed.");
    if (res.ok) await load();
    return res.ok;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const ok = await post({ action: "create", code, percent_off: Number(pct), max_uses: maxUses ? Number(maxUses) : null });
    if (ok) { setCode(""); setMaxUses(""); }
  }

  return (
    <section aria-label="Coupons">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold tracking-tight text-fg">Coupons &amp; discounts</h2>
        <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted">{coupons.length} codes</span>
      </div>
      <p className="mt-2 text-sm text-muted">Codes apply to manual (eSewa/Khalti/bank) checkouts today — the discount is recomputed on the server, never trusted from the browser.</p>
      {msg && <p className="mt-3 rounded-[var(--radius)] border border-border bg-surface p-3 text-sm text-fg" role="status">{msg}</p>}
      {!activated && (
        <p className="mt-4 rounded-[var(--radius)] border border-warning bg-warning-bg p-3 text-sm text-warning" role="note">
          Coupons are not activated yet — run the latest <code>supabase/schema.sql</code> in the Supabase SQL editor to create the table.
        </p>
      )}
      <form onSubmit={create} className="card mt-4 grid gap-3 p-4 sm:grid-cols-[1fr_120px_140px_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="cp-code">New code</label>
          <input id="cp-code" className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LAUNCH20" maxLength={32} required />
        </div>
        <div>
          <label className="label" htmlFor="cp-pct">% off</label>
          <input id="cp-pct" className="input" type="number" min={1} max={90} value={pct} onChange={(e) => setPct(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="cp-max">Max uses (optional)</label>
          <input id="cp-max" className="input" type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" />
        </div>
        <button type="submit" className="btn-primary px-5">Create</button>
      </form>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-surface text-left">
            <tr className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              <th className="px-4 py-3">Code</th><th className="px-4 py-3">Discount</th><th className="px-4 py-3">Used</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Controls</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t border-border transition-colors hover:bg-surface">
                <td className="px-4 py-3 font-bold tracking-wide text-fg">{c.code}</td>
                <td className="px-4 py-3 text-fg">{c.percent_off}% off</td>
                <td className="px-4 py-3 text-muted">{c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 text-muted">
                    <span className="h-2 w-2 rounded-full" style={{ background: c.active ? "var(--success)" : "var(--danger)" }} aria-hidden="true" />
                    {c.active ? "Active" : "Off"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap gap-2">
                    <button type="button" className="btn-ghost !min-h-[44px] px-3 py-1 text-xs" onClick={() => post({ action: "toggle", id: c.id, active: !c.active })}>{c.active ? "Turn off" : "Turn on"}</button>
                    <button type="button" className="btn-ghost !min-h-[44px] px-3 py-1 text-xs" onClick={() => post({ action: "delete", id: c.id })}>Delete</button>
                  </span>
                </td>
              </tr>
            ))}
            {coupons.length === 0 && <tr className="border-t border-border"><td colSpan={5} className="px-4 py-4 text-muted">No coupons yet — create your first code above.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
