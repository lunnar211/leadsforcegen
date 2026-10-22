"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Info = {
  methods: string[];
  pricesNpr: Record<string, number>;
  currency: string;
  instructions: string | null;
  storageConfigured: boolean;
};

// Manual payment (eSewa / Khalti / bank): buyer pays the owner directly,
// uploads proof, and the admin approves it in the admin panel. The amount
// is fixed by the server price map — this form never sends a price.
export default function ManualPayment() {
  const [info, setInfo] = useState<Info | null>(null);
  const [method, setMethod] = useState("esewa");
  const [months, setMonths] = useState("1");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/payments/manual-info")
      .then((r) => r.json())
      .then((d) => setInfo(d.data || null))
      .catch(() => setInfo(null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setMsg("Attach a screenshot of your payment first."); return; }
    setBusy(true); setMsg("");
    try {
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = data.session?.access_token;
      if (!token) { setMsg("Please log in (or sign up) first — your Pro activates on the account you are signed in with."); return; }
      const form = new FormData();
      form.set("method", method);
      form.set("months", months);
      form.set("proof", file);
      const res = await fetch("/api/payments/manual-proof", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: { amount: number; currency: string } };
      if (res.ok && d.ok) {
        setMsg(`Proof submitted for NPR ${d.data?.amount}. Status: pending review. The owner approves payments manually — Pro activates on your account once approved.`);
        setFile(null);
      } else {
        setMsg(d.error || "Submission failed. Please try again.");
      }
    } catch {
      setMsg("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!info) return null;
  const price = info.pricesNpr[months];

  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="font-semibold text-white">Pay manually — eSewa / Khalti / Bank (Nepal)</h2>
      {!info.storageConfigured ? (
        <p className="mt-2 text-sm text-amber-200">Manual payments open as soon as the owner finishes connecting the database. Check back shortly.</p>
      ) : !info.instructions ? (
        <p className="mt-2 text-sm text-amber-200">The owner has not published payment receiving details yet. Please check back shortly.</p>
      ) : (
        <>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{info.instructions}</p>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select aria-label="Payment method" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5" value={method} onChange={(e) => setMethod(e.target.value)}>
                {info.methods.map((m) => (<option key={m} value={m}>{m === "esewa" ? "eSewa" : m === "khalti" ? "Khalti" : "Bank transfer"}</option>))}
              </select>
              <select aria-label="Duration" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5" value={months} onChange={(e) => setMonths(e.target.value)}>
                {Object.keys(info.pricesNpr).map((m) => (<option key={m} value={m}>{m} month{Number(m) > 1 ? "s" : ""} — NPR {info.pricesNpr[m].toLocaleString()}</option>))}
              </select>
            </div>
            <p className="text-sm text-slate-300">Send exactly <b className="text-white">NPR {price?.toLocaleString()}</b>, then upload the payment screenshot:</p>
            <input aria-label="Payment proof image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm" />
            <button disabled={busy} className="w-full rounded-xl bg-emerald-600 py-3 font-semibold hover:bg-emerald-500 disabled:opacity-50">{busy ? "Submitting…" : "Submit payment proof"}</button>
          </form>
        </>
      )}
      {msg && <p className="mt-3 text-sm text-slate-200" role="status">{msg}</p>}
    </div>
  );
}
