"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ManualPayment from "@/components/ManualPayment";

declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void } } }

type Methods = { lemon: boolean; paddle: boolean; binance: boolean; razorpay: boolean; stripe: boolean; manual: boolean; country: string | null };
type Region = "NP" | "INTL";
type Gateway = "lemon" | "paddle" | "binance" | "razorpay" | "stripe";

// EU member states (ISO 3166-1 alpha-2), for the card-first bucket.
const EU_COUNTRIES = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);

// Per-country LEADING order for the checkout page, applied client-side
// to the server's methods response. This only reorders — it never
// invents an option: the caller filters the result to gateways whose
// methods boolean is true, so an unconfigured gateway is never shown.
//   IN → Razorpay first (local method), then card/crypto fallbacks.
//   US/GB/CA/AU/EU + other card countries → Lemon/Paddle card first.
//   NP → manual leads (handled by rendering order, not this list);
//     card fallbacks below the manual section use the default order.
//   Anywhere else, and country null (no edge header) → Lemon/Paddle/
//     Binance order (the INTL default).
function gatewayOrder(country: string | null): Gateway[] {
  if (country === "IN") return ["razorpay", "lemon", "paddle", "stripe", "binance"];
  if (country && (country === "US" || country === "GB" || country === "CA" || country === "AU" || EU_COUNTRIES.has(country))) {
    return ["lemon", "paddle", "stripe", "binance", "razorpay"];
  }
  return ["lemon", "paddle", "binance", "stripe", "razorpay"];
}

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
  // True when Binance redirected back after payment (?binance_return=1),
  // read client-side only to avoid a hydration mismatch.
  const [binanceReturn, setBinanceReturn] = useState(false);

  useEffect(() => {
    let alive = true;
    try { setBinanceReturn(new URLSearchParams(window.location.search).get("binance_return") === "1"); } catch { /* ignore */ }
    fetch("/api/payments/methods")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setMethods({ lemon: !!d.lemon, paddle: !!d.paddle, binance: !!d.binance, razorpay: !!d.razorpay, stripe: !!d.stripe, manual: !!d.manual, country: d.country || null });
        setRegion(d.country === "NP" ? "NP" : "INTL");
      })
      .catch(() => { if (alive) setMethods({ lemon: false, paddle: false, binance: false, razorpay: false, stripe: false, manual: false, country: null }); });
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

  async function payBinance() {
    setBusy(true); setMsg("");
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = data.session?.access_token;
      const res = await fetch("/api/payments/binance/checkout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.data?.checkoutUrl) {
        // Remember the order so the return page can verify it.
        try {
          sessionStorage.setItem("lfg-binance-order", JSON.stringify({ merchantTradeNo: d.data.merchantTradeNo, prepayId: d.data.prepayId || "" }));
        } catch { /* storage unavailable — verify button just won't appear */ }
        window.location.href = d.data.checkoutUrl;
        return;
      }
      setMsg(res.status === 401 ? (d.error || "Sign in first, then try again.") : "Binance Pay checkout is not available right now. Please try again shortly.");
    } catch { setMsg("Something went wrong starting checkout. Please try again."); }
    finally { setBusy(false); }
  }

  async function verifyBinance() {
    setBusy(true); setMsg("");
    try {
      let stored: { merchantTradeNo?: string; prepayId?: string } = {};
      try { stored = JSON.parse(sessionStorage.getItem("lfg-binance-order") || "{}"); } catch { stored = {}; }
      if (!stored.merchantTradeNo) { setMsg("No Binance order found in this browser. Start a Binance checkout first."); return; }
      const { supabase } = await import("@/lib/supabaseClient");
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = data.session?.access_token;
      const res = await fetch("/api/payments/binance/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(stored),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? (d.message || "Pro activated.") : `Verification failed: ${d.error || "unknown"}`);
      if (res.ok) { try { sessionStorage.removeItem("lfg-binance-order"); } catch { /* ignore */ } }
    } catch { setMsg("Something went wrong verifying. Please try again."); }
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

  // Ordered, configured-only card gateways for this visitor. The first
  // one leads (primary button); the rest follow as secondary buttons.
  // An unconfigured gateway is filtered out here and never rendered.
  const gatewayActions: Record<Gateway, { label: string; action: () => void }> = {
    lemon: { label: "Pay worldwide — Card / PayPal / Apple Pay", action: payLemon },
    paddle: { label: "Pay with Paddle — cards worldwide", action: payPaddle },
    binance: { label: "Pay with Binance — 19 USDT (crypto)", action: payBinance },
    razorpay: { label: "Pay with Razorpay (India)", action: () => pay("razorpay") },
    stripe: { label: "Pay with Stripe", action: () => pay("stripe") },
  };
  const orderedGateways: Gateway[] = methods ? gatewayOrder(methods.country).filter((gw) => methods[gw]) : [];
  const hasCardGateway = orderedGateways.length > 0;
  function gatewayButton(gw: Gateway, primary: boolean, labelOverride?: string) {
    const g = gatewayActions[gw];
    return (
      <button key={gw} disabled={busy} onClick={g.action} className={primary ? "btn-cta btn-block" : "btn-ghost btn-block"}>
        {labelOverride || g.label}
      </button>
    );
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
          {/* Country-led order: only configured gateways render, the
              first one as the primary button. E.g. IN leads with
              Razorpay, US/GB/EU/CA/AU lead with Lemon/Paddle, everywhere
              else (and country null) leads with Lemon/Paddle/Binance. */}
          {orderedGateways.map((gw, i) => gatewayButton(gw, i === 0))}
          {binanceReturn && (
            <button disabled={busy} onClick={verifyBinance} className="btn-cta btn-block">I&rsquo;ve paid in Binance — verify &amp; activate Pro</button>
          )}
          {methods && !hasCardGateway && (
            <p className="text-sm text-warning bg-warning-bg border border-warning rounded-[var(--radius)] p-3" role="status">
              Card payments are not connected yet. Please check back soon.
            </p>
          )}
          {methods?.manual && (
            <p className="text-center text-sm text-muted">
              Paying from Nepal?{" "}
              <button type="button" onClick={() => setRegion("NP")} className="font-semibold text-accent-text underline">Pay with eSewa / Khalti instead</button>
            </p>
          )}
        </div>
      ) : null}
      {msg && <p className="mt-4 text-sm text-warning bg-warning-bg border border-warning rounded-[var(--radius)] p-3" role="alert">{msg}</p>}
      {/* NP leads with manual (eSewa/Khalti) — the manual section renders
          first, card options (if any are configured) follow below it.
          If no card gateway is configured, a plain note says so above
          the manual section instead of implying a card option works. */}
      {region === "NP" && (
        <div>
          {methods && !hasCardGateway && (
            <p className="mt-6 text-sm text-warning bg-warning-bg border border-warning rounded-[var(--radius)] p-3" role="status">
              Card payments are not connected yet — you can still pay manually below.
            </p>
          )}
          <ManualPayment />
          {hasCardGateway && (
            <div className="mt-6 space-y-3">
              {orderedGateways.map((gw) => gatewayButton(gw, false, gw === "lemon" ? "Or pay by card in USD ($19) — Card / PayPal / Apple Pay" : undefined))}
              {binanceReturn && (
                <button disabled={busy} onClick={verifyBinance} className="btn-cta btn-block">I&rsquo;ve paid in Binance — verify &amp; activate Pro</button>
              )}
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted mt-4">Secure by design: prices are set on the server, payments are signature-verified on the server, and duplicate payments / replayed webhooks are automatically skipped — a browser success message alone can never activate Pro.</p>
      <Link href="/dashboard" className="mt-6 flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-accent-text underline">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        Back to dashboard
      </Link>
    </div>
  );
}
