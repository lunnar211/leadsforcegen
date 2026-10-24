"use client";
import { useCallback, useEffect, useState } from "react";
import ManualPaymentsQueue from "@/components/ManualPaymentsQueue";
import AdminMoney from "@/components/AdminMoney";
import AdminHealth from "@/components/AdminHealth";
import SupportInbox from "@/components/SupportInbox";
import CouponsManager from "@/components/CouponsManager";
import SiteSettings from "@/components/SiteSettings";

type UserRow = { id: string; email: string; plan: string; role: string; is_active: boolean; created_at: string };
type PaymentRow = { id: string; email: string | null; gateway: string; amount: number; currency: string; status: string; created_at: string };

const DEMO_USERS: UserRow[] = [
  { id: "demo-1", email: "demo-user-1@example.com", plan: "free", role: "user", is_active: true, created_at: "2026-10-01" },
  { id: "demo-2", email: "demo-user-2@example.com", plan: "pro", role: "user", is_active: true, created_at: "2026-10-05" },
  { id: "demo-3", email: "owner@example.com", plan: "pro", role: "admin", is_active: true, created_at: "2026-09-20" },
];
const DEMO_ACTIVITY = [
  "demo-user-2 upgraded to Pro (sample)", "demo-user-1 ran a lead search: SaaS · Kathmandu (sample)",
  "New signup: demo-user-1@example.com (sample)", "AI outreach generated (sample)",
];

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "payments", label: "Payments" },
  { id: "approvals", label: "Approvals" },
  { id: "support", label: "Support" },
  { id: "coupons", label: "Coupons" },
  { id: "settings", label: "Settings" },
  { id: "health", label: "System health" },
  { id: "activity", label: "Activity" },
] as const;
type TabId = (typeof TABS)[number]["id"];

// Tabbed admin shell (redesigned 2026-10-23, UI/UX Pro Max dense system):
// sidebar on desktop, scrollable chip row on mobile. All data and
// controls go through owner-only server APIs; when an API is unavailable
// the panel falls back to clearly labeled sample data.
export default function AdminPanel() {
  const [tab, setTab] = useState<TabId>("overview");
  const [users, setUsers] = useState<UserRow[]>(DEMO_USERS);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [live, setLive] = useState(false);
  const [activity, setActivity] = useState<string[]>(DEMO_ACTIVITY);
  const [stats, setStats] = useState({ users: DEMO_USERS.length, searches: 42, leads: 318, pro: 1 });
  const [msg, setMsg] = useState("");
  const [userQuery, setUserQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok && d.data) {
        setUsers(d.data.users || []);
        setPayments(d.data.payments || []);
        setStats(d.data.stats);
        setActivity(d.data.activity?.length ? d.data.activity : ["No activity recorded yet."]);
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
  const shownUsers = users.filter((u) => !userQuery.trim() || u.email.toLowerCase().includes(userQuery.trim().toLowerCase()));

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:py-10">
      {/* Dense-dashboard header: title, live-state badge, session action. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">Admin Panel</h1>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">LeadsForceGen control room</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-fg" role="status">
          <span className="h-2 w-2 rounded-full" style={{ background: live ? "var(--success)" : "var(--warning)" }} aria-hidden="true" />
          {live ? "Live data" : "Demo data"}
        </span>
        <button onClick={async () => { await fetch("/api/admin/login", { method: "DELETE" }); location.reload(); }} className="btn-ghost ml-auto px-3.5 text-sm">Log out of admin</button>
      </div>
      {msg && <p className="mt-3 rounded-[var(--radius)] border border-border bg-surface p-3 text-sm text-fg" role="status">{msg}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[208px_minmax(0,1fr)]">
        {/* Section navigation: sidebar (desktop) / horizontal chips (mobile). */}
        <nav aria-label="Admin sections" className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-24 lg:flex-col lg:self-start lg:overflow-visible lg:pb-0">
          {TABS.map((t) => (
            <button
              key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
              className="shrink-0 rounded-[var(--radius)] px-3.5 text-left text-sm font-semibold transition-colors lg:w-full"
              style={tab === t.id
                ? { background: "var(--accent)", color: "#fff", minHeight: 44 }
                : { color: "var(--fg)", minHeight: 44 }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {tab === "overview" && (
            <section aria-label="Overview">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {cards.map(([k, v]) => (
                  <div key={k} className="card card-hover relative overflow-hidden p-4 sm:p-5">
                    <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "linear-gradient(90deg, var(--accent), var(--cta))" }} aria-hidden="true" />
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{k}</p>
                    <p className="mt-1.5 text-3xl font-extrabold tracking-tight text-fg">{v}</p>
                  </div>
                ))}
              </div>
              <div className="card mt-4 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-semibold text-fg">Recent payments</h3>
                  <button type="button" className="btn-ghost ml-auto px-3 py-1.5 text-xs" onClick={() => setTab("payments")}>Open money page</button>
                </div>
                {payments.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">No payments recorded yet. Enable a gateway (Payments tab shows the finance view) or approve a manual proof.</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {payments.slice(0, 8).map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 first:border-t-0 first:pt-0">
                        <span className="font-medium text-fg">{p.email || "—"}</span>
                        <span className="text-muted">{p.gateway}</span>
                        <span className="ml-auto font-semibold text-fg">{p.currency} {Number(p.amount).toLocaleString()}</span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold capitalize text-muted">{p.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="card mt-4 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-semibold text-fg">Latest activity</h3>
                  <button type="button" className="btn-ghost ml-auto px-3 py-1.5 text-xs" onClick={() => setTab("activity")}>Full log</button>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-muted">{activity.slice(0, 6).map((a, i) => <li key={i}>• {a}</li>)}</ul>
              </div>
              <p className="mt-4 text-xs text-muted">
                {live
                  ? "Live data from Supabase, served by the owner-only admin API. The browser never receives database credentials."
                  : "Demo / sample data — the admin API is unavailable (Supabase not configured or the schema has not been applied yet)."}
              </p>
            </section>
          )}

          {tab === "users" && (
            <section aria-label="Users">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold tracking-tight text-fg">Users {live ? "" : "(demo)"}</h2>
                <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted">{shownUsers.length} shown</span>
                <input
                  type="search" value={userQuery} onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Search users by email…" aria-label="Search users by email"
                  className="input ml-auto w-full max-w-xs"
                />
              </div>
              <div className="card mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-surface text-left">
                    <tr className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
                      <th className="px-4 py-3">Email</th><th className="px-4 py-3">Plan</th><th className="hidden px-4 py-3 md:table-cell">Role</th><th className="px-4 py-3">Status</th><th className="hidden px-4 py-3 md:table-cell">Joined</th><th className="px-4 py-3">Controls</th>
                    </tr>
                  </thead>
                  <tbody>{shownUsers.map(u => (
                    <tr key={u.id} className="border-t border-border transition-colors hover:bg-surface">
                      <td className="break-all px-4 py-3 font-medium text-fg">{u.email}</td>
                      <td className="px-4 py-3">
                        {u.plan === "pro"
                          ? <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-bold text-cta-fg" style={{ background: "var(--cta)" }}>PRO</span>
                          : <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted">FREE</span>}
                      </td>
                      <td className="hidden px-4 py-3 text-muted md:table-cell">{u.role}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-muted">
                          <span className="h-2 w-2 rounded-full" style={{ background: u.is_active ? "var(--success)" : "var(--danger)" }} aria-hidden="true" />
                          {u.is_active ? "Active" : "Banned"}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-muted md:table-cell">{String(u.created_at).slice(0, 10)}</td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap gap-2">
                          <button onClick={() => control(u, "toggle-plan")} className="btn-ghost !min-h-[44px] px-3 py-1 text-xs">Toggle plan</button>
                          <button onClick={() => control(u, "toggle-active")} className="btn-ghost !min-h-[44px] px-3 py-1 text-xs">{u.is_active ? "Ban / deactivate" : "Reactivate"}</button>
                        </span>
                      </td></tr>))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === "payments" && <AdminMoney />}
          {tab === "approvals" && <ManualPaymentsQueue />}
          {tab === "support" && <SupportInbox />}
          {tab === "coupons" && <CouponsManager />}
          {tab === "settings" && <SiteSettings />}
          {tab === "health" && <AdminHealth />}
          {tab === "activity" && (
            <section aria-label="Activity log" className="card p-5">
              <h3 className="font-semibold text-fg">Activity log</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">{activity.map((a, i) => <li key={i}>• {a}</li>)}</ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
