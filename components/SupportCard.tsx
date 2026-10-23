"use client";
import { useCallback, useEffect, useState } from "react";

type MyTicket = { id: string; subject: string; status: string; admin_reply: string | null; created_at: string };

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

export default function SupportCard() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers.Authorization) { setSignedIn(false); return; }
    setSignedIn(true);
    try {
      const res = await fetch("/api/support", { headers });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) setTickets(d.data.tickets || []);
    } catch { /* silent */ }
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  if (signedIn === false) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ subject, message }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) { setMsg("Ticket sent — we usually reply within a day."); setSubject(""); setMessage(""); await load(); }
      else setMsg(d.error || "Could not send the ticket. Please try again.");
    } catch { setMsg("Could not send the ticket. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-8" aria-label="Support">
      <h2 className="text-lg font-semibold text-fg">Support</h2>
      <div className="card mt-3 p-5">
        <p className="text-sm text-muted">Questions about leads, billing or your plan? Send a ticket — replies appear right here.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="sup-subject">Subject</label>
            <input id="sup-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Payment not reflected" maxLength={140} required />
          </div>
          <div>
            <label className="label" htmlFor="sup-message">Message</label>
            <textarea id="sup-message" className="input min-h-[90px]" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe the issue…" maxLength={4000} required />
          </div>
          {msg && <p className="text-sm text-fg" role="status">{msg}</p>}
          <button type="submit" className="btn-primary px-5" disabled={busy}>{busy ? "Sending…" : "Send ticket"}</button>
        </form>
        {tickets.length > 0 && (
          <ul className="mt-5 space-y-3 border-t border-border pt-4">
            {tickets.map((t) => (
              <li key={t.id} className="text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-fg">{t.subject}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold capitalize text-muted">{t.status}</span>
                  <span className="text-xs text-muted">{String(t.created_at).slice(0, 10)}</span>
                </p>
                {t.admin_reply && <p className="mt-1.5 rounded-[var(--radius)] bg-surface p-3 leading-relaxed text-fg"><span className="font-semibold">Support:</span> {t.admin_reply}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
