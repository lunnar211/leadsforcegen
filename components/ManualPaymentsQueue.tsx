"use client";
import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  email: string | null;
  amount: number;
  currency: string;
  method: string | null;
  months: number | null;
  created_at: string;
  proofUrl: string | null;
};

// Owner-only queue: approve (money received) or reject manual payments.
// Data comes from /api/admin/payments, which requires the admin session.
export default function ManualPaymentsQueue() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/payments");
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: Row[]; error?: string };
      if (res.ok && d.ok) setRows(d.data || []);
      else if (res.status !== 503) setMsg(d.error || "");
    } catch { /* demo mode: stay quiet */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    (async () => { await load(); })();
  }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    const res = await fetch("/api/admin/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setMsg(res.ok && d.ok ? `Payment ${action === "approve" ? "approved — Pro activated" : "rejected"}.` : d.error || "Action failed.");
    load();
  }

  if (!loaded) return null;
  return (
    <div className="card mt-8 p-5">
      <h3 className="font-semibold text-fg">Manual payments awaiting review ({rows.length})</h3>
      {msg && <p className="mt-2 text-sm text-fg" role="status">{msg}</p>}
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No pending eSewa/Khalti/bank submissions. New submissions appear here for approval — Pro only activates after you approve.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-border p-3 text-sm">
              <span className="text-fg font-medium break-all">{r.email || "unknown"}</span>
              <span>{r.method} · {r.months} mo · {r.currency} {Number(r.amount).toLocaleString()}</span>
              <span className="text-muted">{String(r.created_at).slice(0, 16).replace("T", " ")}</span>
              {r.proofUrl && (<a href={r.proofUrl} target="_blank" rel="noreferrer" className="underline text-accent-text font-semibold">View proof</a>)}
              <span className="ml-auto flex gap-2">
                <button onClick={() => act(r.id, "approve")} className="btn-primary !min-h-[44px] px-3 py-1.5 text-xs">Approve</button>
                <button onClick={() => act(r.id, "reject")} className="btn-ghost !min-h-[44px] px-3 py-1.5 text-xs">Reject</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
