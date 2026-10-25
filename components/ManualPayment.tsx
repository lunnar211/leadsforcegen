"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
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
  const [needsLogin, setNeedsLogin] = useState(false);
  // Bank details are never in the initial render: the buyer must be
  // signed in AND click to reveal them (see manual-info route).
  const [revealed, setRevealed] = useState(false);
  const [method, setMethod] = useState("esewa");
  const [months, setMonths] = useState("1");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [couponPct, setCouponPct] = useState<number | null>(null);
  const [couponMsg, setCouponMsg] = useState("");

  async function applyCoupon() {
    const code = coupon.trim().toUpperCase();
    if (!code) return;
    setCouponMsg("");
    try {
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = data.session?.access_token;
      if (!token) { setCouponMsg("Log in first, then apply the code."); return; }
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) { setCouponPct(Number(d.data.percent_off)); setCouponMsg(`Code applied: ${d.data.percent_off}% off.`); }
      else { setCouponPct(null); setCouponMsg(d.error || "That code is not valid."); }
    } catch { setCouponMsg("Could not check the code. Try again."); }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
        const token = data.session?.access_token;
        if (!token) { if (alive) setNeedsLogin(true); return; }
        const r = await fetch("/api/payments/manual-info", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.status === 401) { setNeedsLogin(true); return; }
        setInfo(d.data || null);
      } catch { if (alive) setInfo(null); }
    })();
    return () => { alive = false; };
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
      if (couponPct) form.set("coupon_code", coupon.trim().toUpperCase());
      form.set("proof", file);
      const res = await fetch("/api/payments/manual-proof", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: { amount: number; currency: string; coupon_warning?: string; duplicate?: boolean } };
      if (res.ok && d.ok) {
        setMsg(`Proof submitted for NPR ${d.data?.amount}. Status: pending review. The owner approves payments manually — Pro activates on your account once approved.${d.data?.duplicate ? " (This proof was already pending, so no second record was created.)" : ""}${d.data?.coupon_warning ? ` Note: ${d.data.coupon_warning}` : ""}`);
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

  if (needsLogin) {
    return (
      <div className="card mt-8 p-5">
        <h2 className="font-semibold text-fg">Pay manually — eSewa / Khalti / Bank (Nepal)</h2>
        <p className="mt-2 text-sm text-muted">
          Payment details are shown only to signed-in buyers, to keep the owner&rsquo;s bank details out of public pages and search results.{" "}
          <a className="font-semibold text-accent-text underline" href="/login">Log in</a> to see them.
        </p>
      </div>
    );
  }
  if (!info) return null;
  const basePrice = info.pricesNpr[months];
  const price = couponPct ? Math.max(1, Math.round(basePrice * (1 - couponPct / 100))) : basePrice;

  return (
    <div className="card mt-8 p-5">
      <h2 className="font-semibold text-fg">Pay manually — eSewa / Khalti / Bank (Nepal)</h2>
      {!info.storageConfigured ? (
        <p className="mt-2 text-sm text-warning">Manual payments open as soon as the owner finishes connecting the database. Check back shortly.</p>
      ) : !info.instructions ? (
        <p className="mt-2 text-sm text-warning">The owner has not published payment receiving details yet. Please check back shortly.</p>
      ) : (
        <>
          {!revealed ? (
            <button type="button" onClick={() => setRevealed(true)} className="btn-ghost btn-block mt-3">
              Show payment details
            </button>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{info.instructions}</p>
          )}
          {method === "esewa" && (
            <div className="mt-4 text-center">
              {/* The owner's own eSewa receive QR, published by him for this checkout. */}
              <Image src="/esewa-qr.png" alt="eSewa QR code — scan to pay Dipesh Karki" width={192} height={192} className="mx-auto h-48 w-48 rounded-lg border border-border bg-white p-2" />
              <p className="mt-2 text-xs text-muted">Scan with eSewa or any FonePay-network banking app to pay.</p>
            </div>
          )}
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="label" htmlFor="mp-method">Payment method</label><select id="mp-method" aria-label="Payment method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {info.methods.map((m) => (<option key={m} value={m}>{m === "esewa" ? "eSewa" : m === "khalti" ? "Khalti" : "Bank transfer"}</option>))}
              </select>
              <label className="label" htmlFor="mp-months">Duration</label><select id="mp-months" aria-label="Duration" className="input" value={months} onChange={(e) => setMonths(e.target.value)}>
                {Object.keys(info.pricesNpr).map((m) => (<option key={m} value={m}>{m} month{Number(m) > 1 ? "s" : ""} — NPR {info.pricesNpr[m].toLocaleString()}</option>))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="mp-coupon">Coupon code (optional)</label>
              <div className="flex gap-2">
                <input id="mp-coupon" className="input" value={coupon} onChange={(e) => { setCoupon(e.target.value.toUpperCase()); setCouponPct(null); }} placeholder="LAUNCH20" maxLength={32} />
                <button type="button" className="btn-ghost shrink-0 px-4" onClick={applyCoupon}>Apply</button>
              </div>
              {couponMsg && <p className="mt-1.5 text-xs text-muted" role="status">{couponMsg}</p>}
            </div>
            <p className="text-sm text-muted">Send exactly <b className="text-fg">NPR {price?.toLocaleString()}</b>{couponPct ? <> (was NPR {basePrice?.toLocaleString()}, {couponPct}% off)</> : null}, then upload the payment screenshot:</p>
            <label className="label" htmlFor="mp-proof">Payment screenshot</label><input id="mp-proof" aria-label="Payment proof image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} className="input text-sm" />
            <button disabled={busy} className="btn-primary btn-block">{busy ? "Submitting…" : "Submit payment proof"}</button>
          </form>
        </>
      )}
      {msg && <p className="mt-3 text-sm text-fg" role="status">{msg}</p>}
    </div>
  );
}
