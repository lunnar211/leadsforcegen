"use client";
import { useCallback, useEffect, useState } from "react";
import ManualPaymentsQueue from "@/components/ManualPaymentsQueue";
import AdminMoney from "@/components/AdminMoney";
import AdminHealth from "@/components/AdminHealth";

type UserRow = { id: string; email: string; plan: string; role: string; is_active: boolean; created_at: string };

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
  const [stats, setStats] = useState({ users: DEMO_USERS.length, searches: 42, leads: 318, pro: 1 });
  const [msg, setMsg] = useState("");
  const [userQuery, setUserQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok && d.data) {
        setUsers(d.data.users || []);
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
      <input
        type="search" value={userQuery} onChange={(e) => setUserQuery(e.target.value)}
        placeholder="Search users by email…" aria-label="Search users by email"
        className="input mt-3 max-w-sm"
      />
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted"><tr><th className="p-3">Email</th><th className="p-3">Plan</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Joined</th><th className="p-3">Controls</th></tr></thead>
          <tbody>{users.filter((u) => !userQuery.trim() || u.email.toLowerCase().includes(userQuery.trim().toLowerCase())).map(u => (
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

      <AdminMoney />

      <div className="card p-5 mt-10"><h3 className="font-semibold text-fg">Activity log</h3>
        <ul className="text-sm text-muted mt-3 space-y-2">{activity.map((a, i) => <li key={i}>• {a}</li>)}</ul></div>

      <AdminHealth />
    </div>
  );
}
