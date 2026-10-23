"use client";
import { useCallback, useEffect, useState } from "react";

type Ticket = { id: string; email: string; subject: string; message: string; status: string; admin_reply: string | null; created_at: string };

const STATUS_STYLE: Record<string, string> = {
  open: "var(--cta)",
  answered: "var(--accent)",
  closed: "var(--muted)",
};

export default function SupportInbox() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activated, setActivated] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tickets");
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) { setTickets(d.data.tickets || []); setActivated(d.data.activated !== false); }
    } catch { /* keep empty */ }
    setLoaded(true);
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  async function save(t: Ticket, status?: string) {
    const res = await fetch("/api/admin/tickets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, admin_reply: reply, ...(status ? { status } : {}) }),
    });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok && d.ok ? "Saved." : d.error || "Could not save.");
    if (res.ok) { setReply(""); await load(); }
  }

  const openCount = tickets.filter((t) => t.status === "open").length;
  return (
    <section aria-label="Support tickets">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold tracking-tight text-fg">Support tickets</h2>
        <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted">{openCount} open · {tickets.length} total</span>
      </div>
      {msg && <p className="mt-3 rounded-[var(--radius)] border border-border bg-surface p-3 text-sm text-fg" role="status">{msg}</p>}
      {!activated && loaded && (
        <p className="mt-4 rounded-[var(--radius)] border border-warning bg-warning-bg p-3 text-sm text-warning" role="note">
          Support tickets are not activated yet — run the latest <code>supabase/schema.sql</code> in the Supabase SQL editor to create the table.
        </p>
      )}
      <div className="mt-4 space-y-3">
        {loaded && activated && tickets.length === 0 && <p className="text-sm text-muted">No tickets yet. Users open tickets from their dashboard support card.</p>}
        {tickets.map((t) => (
          <article key={t.id} className="card p-4">
            <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => { setOpenId(openId === t.id ? null : t.id); setReply(t.admin_reply || ""); }} aria-expanded={openId === t.id}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_STYLE[t.status] || "var(--muted)" }} aria-hidden="true" />
              <span className="font-semibold text-fg">{t.subject}</span>
              <span className="text-xs text-muted">{t.email} · {String(t.created_at).slice(0, 10)}</span>
              <span className="ml-auto rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold capitalize text-muted">{t.status}</span>
            </button>
            {openId === t.id && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{t.message}</p>
                <label className="label mt-4" htmlFor={`reply-${t.id}`}>Your reply (the user sees this in their dashboard)</label>
                <textarea id={`reply-${t.id}`} className="input min-h-[90px]" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a helpful reply…" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-primary px-4 text-sm" onClick={() => save(t)}>Save reply</button>
                  {t.status !== "closed" && <button type="button" className="btn-ghost px-4 text-sm" onClick={() => save(t, "closed")}>Close ticket</button>}
                  {t.status === "closed" && <button type="button" className="btn-ghost px-4 text-sm" onClick={() => save(t, "open")}>Reopen</button>}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
