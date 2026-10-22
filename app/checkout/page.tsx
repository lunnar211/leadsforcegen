"use client";
import { useState } from "react";
import Link from "next/link";

declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void } } }

export default function Checkout() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

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
            setMsg(v.ok ? vd.message : `Verification failed: ${vd.error || "unknown"}`);
            if (v.ok) localStorage.setItem("leadsforcegen_plan", "pro");
          },
        });
        rzp.open();
      }
    } catch { setMsg("Something went wrong starting checkout. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-2xl font-bold text-white">Upgrade to LeadsForceGen Pro</h1>
      <p className="text-slate-400 text-sm mt-2">Unlimited leads, CSV export and full AI outreach — $19/mo (₹1,499 via Razorpay).</p>
      <div className="mt-6 space-y-3">
        <button disabled={busy} onClick={() => pay("razorpay")} className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-xl py-3 font-semibold disabled:opacity-50">Pay with Razorpay</button>
        <button disabled={busy} onClick={() => pay("stripe")} className="w-full border border-white/20 rounded-xl py-3 font-semibold disabled:opacity-50">Pay with Stripe</button>
      </div>
      {msg && <p className="mt-4 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">{msg}</p>}
      <p className="text-xs text-slate-500 mt-4">🔒 Secure by design: prices are set on the server, payments are signature-verified on the server, and duplicate payments / replayed webhooks are automatically skipped — a browser success message alone can never activate Pro.</p>
      <Link href="/dashboard" className="block text-center mt-6 text-sm text-indigo-300">← Back to dashboard</Link>
    </div>
  );
}
