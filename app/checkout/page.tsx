"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ManualPayment from "@/components/ManualPayment";

declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void } } }

type Methods = { lemon: boolean; paddle: boolean; razorpay: boolean; stripe: boolean; manual: boolean; country: string | null };
type Region = "NP" | "INTL";

export default function Checkout() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // Which gateways the server actually has connected. Only those are
  // shown — a customer never sees a button that can only fail, and never
  // sees a raw "env vars not configured" message.
  const [methods, setMethods] = useState<Methods | null>(null);
  // Payment region: Nepal pays by eSewa/Khalti/bank (NPR); everyone else
  // pays by card (USD). Auto-detected from the visitor's country, and
  // the visitor can switch it — each region leads with ITS method.
  const [region, setRegion] = useState<Region>("INTL");

  useEffect(() => {
    let alive = true;
    fetch("/api/payments/methods")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setMethods({ lemon: !!d.lemon, paddle: !!d.paddle, razorpay: !!d.razorpay, stripe: !!d.stripe, manual: !!d.manual, country: d.country || null });
        setRegion(d.country === "NP" ? "NP" : "INTL");
      })
      .catch(() => { if (alive) setMethods({ lemon: false, paddle: false, razorpay: false, stripe: false, manual: false, country: null }); });
    return () => { alive = false; };
  }, []);

  async function payLemon() {
    setBusy(true); setMsg("");
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = data.session?.access_token;
      const res = await fetch("/api/payments/lemon/checkout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.data?.url) { window.location.href = d.data.url; return; }
      setMsg(res.status === 401 ? (d.error || "Sign in first, then try again.") : "Worldwide checkout is not available right now. Please try again shortly.");
    } catch { setMsg("Something went wrong starting checkout. Please try again."); }
    finally { setBusy(false); }
  }

  async function payPaddle() {
    setBusy(true); setMsg("");
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = data.session?.access_token;
      const res = await fetch("/api/payments/paddle/checkout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.data?.url) { window.location.href = d.data.url; return; }
      setMsg(res.status === 401 ? (d.error || "Sign in first, then try again.") : "Paddle checkout is not available right now. Please try again shortly.");
    } catch { setMsg("Something went wrong starting checkout. Please try again."); }
    finally { setBusy(false); }
  }

  async function pay(gateway: "razorpay" | "stripe") {
    setBusy(true); setMsg("");
    try {
      // NOTE: no amount is sent — the server decides the price from its plan map.
      const res = await fetch("/api/payments/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gateway, plan: "pro" }) });
      const data = await res.json();
      if (!res.ok) { setMsg("That payment option is not available right now. Please try another option, or check back shortly."); return; }
      if (gateway === "stripe" && data.url) { window.location.href = data.url; return; }
      if (gateway === "razorpay") {
        const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
        if (!keyId) { setMsg("That payment option is not available right now. Please try another option, or check back shortly."); return; }
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = () => resolve(); s.onerror = () => reject(new Error("load failed")); document.body.appendChild(s);
        });
        const rzp = new window.Razorpay!({
          key: keyId, order_id: data.orderId, amount: data.amount, currency: data.currency, name: "LeadsForceGen", description: "LeadsForceGen Pro",
          handler: async (resp: Record<string, string>) => {
            // This callback alone does NOT upgrade the plan. The server verifies
            // the signature + captured amount first (see /api/payments/verify).
            const v = await fetch("/api/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resp) });
            const vd = await v.json();
            setMsg(v.ok ? `${vd.message || "Payment verified."} Your plan is updated on the server — refresh the dashboard to see Pro.` : `Verification failed: ${vd.error || "unknown"}`);
          },
        });
        rzp.open();
      }
    } catch { setMsg("Something went wrong starting checkout. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-bold text-fg">Upgrade to LeadsForceGen Pro</h1>
      <p className="text-muted text-sm mt-2">Unlimited* leads, Excel/CSV export and full AI outreach — $19/mo or NPR pricing from Nepal. *fair use.</p>

      {/* Region selector: each country leads with the payment method
          that actually works there. Auto-set from the visitor's
          country; switchable by hand. */}
      <div className="mt-6" role="group" aria-label="Paying from">
        <span className="label" id="region-label">I&rsquo;m paying from</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="region-label">
          <button type="button" role="radio" aria-checked={region === "NP"} onClick={() => setRegion("NP")} className={region === "NP" ? "btn-primary" : "btn-ghost"}>Nepal</button>
          <button type="button" role="radio" aria-checked={region === "INTL"} onClick={() => setRegion("INTL")} className={region === "INTL" ? "btn-primary" : "btn-ghost"}>Another country</button>
        </div>
      </div>

      {region === "INTL" ? (
        <div className="mt-6 space-y-3">
          {methods === null && <p className="text-sm text-muted" role="status">Loading payment options…</p>}
          {methods?.lemon && <button disabled={busy} onClick={payLemon} className="btn-cta btn-block">Pay worldwide — Card / PayPal / Apple Pay</button>}
          {methods?.paddle && <button disabled={busy} onClick={payPaddle} className="btn-ghost btn-block">Pay with Paddle — cards worldwide</button>}
          {methods?.razorpay && <button disabled={busy} onClick={() => pay("razorpay")} className="btn-ghost btn-block">Pay with Razorpay (India)</button>}
          {methods?.stripe && <button disabled={busy} onClick={() => pay("stripe")} className="btn-ghost btn-block">Pay with Stripe</button>}
          {methods && !methods.lemon && !methods.paddle && !methods.razorpay && !methods.stripe && (
            <p className="text-sm text-warning bg-warning-bg border border-warning rounded-[var(--radius)] p-3" role="status">
              Online card payments are opening very shortly — we are connecting them now. Please check back soon.
            </p>
          )}
          {methods?.manual && (
            <p className="text-center text-sm text-muted">
              Paying from Nepal?{" "}
              <button type="button" onClick={() => setRegion("NP")} className="font-semibold text-accent-text underline">Pay with eSewa / Khalti instead</button>
            </p>
          )}
        </div>
      ) : (
        <div className="mt-2">
          {methods?.lemon && (
            <button disabled={busy} onClick={payLemon} className="btn-ghost btn-block mt-4">Or pay by card in USD ($19) — Card / PayPal / Apple Pay</button>
          )}
        </div>
      )}
      {msg && <p className="mt-4 text-sm text-warning bg-warning-bg border border-warning rounded-[var(--radius)] p-3" role="alert">{msg}</p>}
      {region === "NP" && <ManualPayment />}
      <p className="text-xs text-muted mt-4">Secure by design: prices are set on the server, payments are signature-verified on the server, and duplicate payments / replayed webhooks are automatically skipped — a browser success message alone can never activate Pro.</p>
      <Link href="/dashboard" className="block text-center mt-6 text-sm font-semibold text-accent-text underline">← Back to dashboard</Link>
    </div>
  );
}
