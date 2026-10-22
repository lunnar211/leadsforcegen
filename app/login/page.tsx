"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(""); const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) { setMsg("Demo mode: Supabase is not configured in this environment. You can still open the dashboard in demo mode."); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg(error.message); else router.push("/dashboard");
  }
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-2xl font-bold text-white">Login to LeadsForceGen</h1>
      {!isSupabaseConfigured && <p className="mt-3 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">Demo / offline mode: Supabase env vars are not configured here, so real login is disabled. Set them in Vercel / .env.local to enable auth.</p>}
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3" placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
        <input className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
        {msg && <p className="text-sm text-slate-300">{msg}</p>}
        <button className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-xl py-3 font-semibold">Login</button>
      </form>
      <Link href="/dashboard" className="block text-center mt-4 text-sm text-indigo-300">Continue to dashboard (demo)</Link>
      <p className="text-sm text-slate-400 mt-4 text-center">No account? <Link className="text-indigo-300" href="/signup">Sign up</Link></p>
    </div>
  );
}
