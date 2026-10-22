"use client";
import { useCallback, useEffect, useState } from "react";
import ManualPaymentsQueue from "@/components/ManualPaymentsQueue";

type UserRow = { id: string; email: string; plan: string; role: string; is_active: boolean; created_at: string };
type PaymentRow = { id: string; email: string | null; gateway: string; amount: number; currency: string; status: string; method: string | null; months: number | null; created_at: string };

const DEMO_USERS: UserRow[] = [
  { id: "demo-1", email: "demo-user-1@example.com", plan: "free", role: "user", is_active: true, created_at: "2026-10-01" },
  { id: "demo-2", email: "demo-user-2@example.com", plan: "pro", role: "user", is_active: true, created_at: "2026-10-05" },
  { id: "demo-3", email: "owner@example.com", plan: "pro", role: "admin", is_active: true, created_at: "2026-09-20" },
];
const DEMO_ACTIVITY = [
  "demo-user-2 upgraded to Pro (sample)", "demo-user-1 ran a lead search: SaaS · Kathmandu (sample)",
  "New signup: demo-user-1@example.com (sample)", "AI outreach generated (sample)",
];

// All data and controls go through /api/admin/users (server: admin session
// + service role). When that API is unavailable the panel clearly falls
// back to labeled sample data instead of pretending to be live.
export default function AdminPanel() {
  const [users, setUsers] = useState<UserRow[]>(DEMO_USERS);
  const [live, setLive] = useState(false);
  const [activity, setActivity] = useState<string[]>(DEMO_ACTIVITY);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [stats, setStats] = useState({ users: DEMO_USERS.length, searches: 42, leads: 318, pro: 1 });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok && d.data) {
        setUsers(d.data.users || []);
        setStats(d.data.stats);
        setActivity(d.data.activity?.length ? d.data.activity : ["No activity recorded yet."]);
        setPayments(d.data.payments || []);
        setLive(true);
      }
    } catch { /* keep demo fallback */ }
  }, []);

  useEffect(() => {
    (async () => { await load(); })();
  }, [load]);

  async function control(u: UserRow, action: "toggle-plan" | "toggle-active") {
    if (!live) { setMsg("Demo mode: connect Supabase to use live controls."); return; }
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, action }),
    });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok && d.ok ? "Saved." : d.error || "Action failed.");
    if (res.ok) await load();
  }

  const cards = [["Total users", stats.users], ["Searches", stats.searches], ["Leads generated", stats.leads], ["Pro subscribers", stats.pro]] as const;
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:py-10">
      <h1 className="text-3xl font-bold text-fg">Admin Panel</h1>
      <p className="text-sm text-muted mt-2">
        {live
          ? "Live data from Supabase, served by the owner-only admin API."
          : "Demo / sample data — the admin API is unavailable (Supabase not configured or the schema has not been applied yet)."}
      </p>
      <p className="text-xs text-success mt-2">Protected: this panel loads only after the owner admin login (email + password, server-verified), and all data and controls run through server APIs — the browser never gets database credentials.</p>
      <button onClick={async () => { await fetch("/api/admin/login", { method: "DELETE" }); location.reload(); }} className="btn-ghost mt-3 px-3 py-1.5 text-xs">Log out of admin</button>
      {msg && <p className="mt-3 text-sm text-fg" role="status">{msg}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        {cards.map(([k, v]) => <div key={k} className="card p-5"><p className="text-sm text-muted">{k}</p><p className="text-3xl font-extrabold text-fg mt-1">{v}</p></div>)}
      </div>

      <h2 className="font-semibold text-fg mt-8">Users {live ? "" : "(demo)"}</h2>
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted"><tr><th className="p-3">Email</th><th className="p-3">Plan</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Joined</th><th className="p-3">Controls</th></tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id} className="border-t border-border">
              <td className="p-3 text-fg break-all">{u.email}</td><td className="p-3">{u.plan}</td><td className="p-3">{u.role}</td>
              <td className="p-3">{u.is_active ? "Active" : "Banned / inactive"}</td><td className="p-3">{String(u.created_at).slice(0, 10)}</td>
              <td className="p-3">
                <span className="flex flex-wrap gap-2">
                  <button onClick={() => control(u, "toggle-plan")} className="btn-ghost !min-h-[44px] px-2 py-1 text-xs">Toggle plan</button>
                  <button onClick={() => control(u, "toggle-active")} className="btn-ghost !min-h-[44px] px-2 py-1 text-xs">{u.is_active ? "Ban / deactivate" : "Reactivate"}</button>
                </span>
              </td></tr>))}
          </tbody>
        </table>
      </div>

      <ManualPaymentsQueue />

      <h2 className="font-semibold text-fg mt-8">Payments — all gateways {live ? "" : "(connect Supabase for live data)"}</h2>
      <p className="mt-1 text-sm text-muted">
        A payment shows <b className="text-fg">captured</b> only after server-side verification (gateway signature/webhook, or your approval for manual proofs).
        Browser success messages alone never change a payment or a plan.
      </p>
      <div className="card mt-3 overflow-x-auto">
        {payments.length === 0 ? (
          <p className="p-5 text-sm text-muted">No payments recorded yet. Verified payments from Lemon Squeezy, Stripe, Razorpay and approved manual proofs will appear here.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-muted"><tr><th className="p-3">Date</th><th className="p-3">Email</th><th className="p-3">Gateway</th><th className="p-3">Amount</th><th className="p-3">Status</th></tr></thead>
            <tbody>{payments.map(p => (
              <tr key={p.id} className="border-t border-border">
                <td className="p-3 whitespace-nowrap">{String(p.created_at).slice(0, 16).replace("T", " ")}</td>
                <td className="p-3 text-fg break-all">{p.email || "—"}</td>
                <td className="p-3">{p.gateway}{p.method ? ` · ${p.method}` : ""}</td>
                <td className="p-3 whitespace-nowrap">{p.currency} {Number(p.amount).toLocaleString()}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.status === "captured" ? "bg-success-bg text-success" : p.status === "pending" ? "bg-warning-bg text-warning" : "bg-danger-bg text-danger"}`}>
                    {p.status}
                  </span>
                </td>
              </tr>))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-8">
        <div className="card p-5"><h3 className="font-semibold text-fg">Activity log</h3>
          <ul className="text-sm text-muted mt-3 space-y-2">{activity.map((a, i) => <li key={i}>• {a}</li>)}</ul></div>
        <div className="card p-5"><h3 className="font-semibold text-fg">Subscriptions overview</h3>
          <p className="text-sm text-muted mt-3">Pro subscribers: {stats.pro} · Free users: {Math.max(0, stats.users - stats.pro)}<br />Payments upgrade a plan only after server verification (see the payments table above).<br />Est. MRR (Pro $19): ${stats.pro * 19}/mo</p></div>
      </div>
    </div>
  );
}
