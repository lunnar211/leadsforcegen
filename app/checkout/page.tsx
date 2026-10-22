"use client";
import { useState } from "react";
import Link from "next/link";
import ManualPayment from "@/components/ManualPayment";

declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void } } }

export default function Checkout() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

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
      setMsg(d.error || "Worldwide checkout is not available yet.");
    } catch { setMsg("Something went wrong starting checkout. Please try again."); }
    finally { setBusy(false); }
  }

  async function pay(gateway: "razorpay" | "stripe") {
    setBusy(true); setMsg("");
    try {
      // NOTE: no amount is sent — the server decides the price from its plan map.
      const res = await fetch("/api/payments/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gateway, plan: "pro" }) });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Checkout is not available yet. The owner needs to configure a payment gateway (Razorpay or Stripe env vars) in Vercel."); return; }
      if (gateway === "stripe" && data.url) { window.location.href = data.url; return; }
      if (gateway === "razorpay") {
        const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
        if (!keyId) { setMsg("Razorpay order created on the server, but NEXT_PUBLIC_RAZORPAY_KEY_ID is not configured, so the checkout popup cannot open here."); return; }
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
      <p className="text-muted text-sm mt-2">Unlimited* leads, CSV export and full AI outreach — $19/mo (₹1,499 via Razorpay). *fair-use 2,000/day.</p>
      <div className="mt-6 space-y-3">
        <button disabled={busy} onClick={payLemon} className="btn-primary btn-block">🌍 Pay worldwide — Card / PayPal / Apple Pay (Lemon Squeezy)</button>
        <button disabled={busy} onClick={() => pay("razorpay")} className="btn-ghost btn-block">Pay with Razorpay (India)</button>
        <button disabled={busy} onClick={() => pay("stripe")} className="btn-ghost btn-block">Pay with Stripe</button>
      </div>
      {msg && <p className="mt-4 text-sm text-warning bg-warning-bg border border-warning rounded-[var(--radius)] p-3" role="alert">{msg}</p>}
      <ManualPayment />
      <p className="text-xs text-muted mt-4">🔒 Secure by design: prices are set on the server, payments are signature-verified on the server, and duplicate payments / replayed webhooks are automatically skipped — a browser success message alone can never activate Pro.</p>
      <Link href="/dashboard" className="block text-center mt-6 text-sm font-semibold text-accent-text underline">← Back to dashboard</Link>
    </div>
  );
}
