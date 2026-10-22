"use client";
import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

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

export default function AdminPanel() {
  const [users, setUsers] = useState<UserRow[]>(DEMO_USERS);
  const [live, setLive] = useState(false);
  const [activity, setActivity] = useState<string[]>(DEMO_ACTIVITY);
  const [stats, setStats] = useState({ users: DEMO_USERS.length, searches: 42, leads: 318, pro: 1 });

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(100);
        if (!error && data && data.length) {
          setUsers(data as UserRow[]); setLive(true);
          const { count: s } = await supabase.from("searches").select("*", { count: "exact", head: true });
          const { count: l } = await supabase.from("leads").select("*", { count: "exact", head: true });
          const { data: act } = await supabase.from("activity_log").select("message").order("created_at", { ascending: false }).limit(10);
          setStats({ users: data.length, searches: s || 0, leads: l || 0, pro: (data as UserRow[]).filter(u => u.plan === "pro").length });
          if (act?.length) setActivity(act.map(a => String((a as { message: string }).message)));
        }
      } catch {}
    })();
  }, []);

  async function updateUser(u: UserRow, patch: Partial<UserRow>) {
    setUsers(users.map(x => x.id === u.id ? { ...x, ...patch } : x));
    if (supabase && live) { try { await supabase.from("profiles").update(patch).eq("id", u.id); } catch {} }
  }

  const cards = [["Total users", stats.users], ["Searches", stats.searches], ["Leads generated", stats.leads], ["Pro subscribers", stats.pro]] as const;
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold text-white">LeadsForceGen — Admin Panel</h1>
      <p className="text-sm text-slate-400 mt-2">{live ? "Live data from Supabase." : "Demo / sample data — Supabase is not connected or returned no rows. Connect Supabase and run supabase/schema.sql to see live data."}</p>
      <p className="text-xs text-emerald-300 mt-2">Protected: this panel loads only after the owner admin login (email + password, server-verified). Live data actions still require Supabase RLS policies for profiles.role = &apos;admin&apos;.</p>
      <button onClick={async () => { await fetch("/api/admin/login", { method: "DELETE" }); location.reload(); }} className="mt-3 border border-white/20 rounded-lg px-3 py-1.5 text-xs">Log out of admin</button>
      <div className="grid md:grid-cols-4 gap-3 mt-6">
        {cards.map(([k, v]) => <div key={k} className="rounded-2xl border border-white/10 bg-white/5 p-5"><p className="text-sm text-slate-400">{k}</p><p className="text-3xl font-extrabold text-white mt-1">{v}</p></div>)}
      </div>
      <h2 className="font-semibold text-white mt-8">Users {isSupabaseConfigured ? "" : "(demo)"}</h2>
      <div className="overflow-x-auto mt-3 rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-300"><tr><th className="p-3">Email</th><th className="p-3">Plan</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Joined</th><th className="p-3">Controls</th></tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id} className="border-t border-white/5">
              <td className="p-3 text-white">{u.email}</td><td className="p-3">{u.plan}</td><td className="p-3">{u.role}</td>
              <td className="p-3">{u.is_active ? "Active" : "Banned / inactive"}</td><td className="p-3">{String(u.created_at).slice(0,10)}</td>
              <td className="p-3 flex gap-2">
                <button onClick={() => updateUser(u, { plan: u.plan === "pro" ? "free" : "pro" })} className="border border-white/20 rounded-lg px-2 py-1 text-xs">Toggle plan</button>
                <button onClick={() => updateUser(u, { is_active: !u.is_active })} className="border border-white/20 rounded-lg px-2 py-1 text-xs">{u.is_active ? "Ban / deactivate" : "Reactivate"}</button>
              </td></tr>))}
          </tbody>
        </table>
      </div>
      <div className="grid md:grid-cols-2 gap-4 mt-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="font-semibold text-white">Activity log</h3>
          <ul className="text-sm text-slate-300 mt-3 space-y-2">{activity.map((a, i) => <li key={i}>• {a}</li>)}</ul></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="font-semibold text-white">Subscriptions overview</h3>
          <p className="text-sm text-slate-300 mt-3">Pro subscribers: {stats.pro} · Free users: {Math.max(0, stats.users - stats.pro)}<br />Payments are only upgraded after server-verified Razorpay / Stripe payment (see /api/payments). Client success callbacks never upgrade a plan by themselves.<br />Est. MRR (demo pricing $19/Pro): ${stats.pro * 19}/mo</p></div>
      </div>
    </div>
  );
}
