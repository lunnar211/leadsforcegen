"use client";
import { useEffect } from "react";

// Google AdSense wiring, fully env-gated: this component renders
// NOTHING until the owner sets NEXT_PUBLIC_ADSENSE_PUBLISHER_ID
// (pub-XXXXXXXXXXXXXXXX) in Vercel and redeploys (env vars apply to
// new deployments only). Until then the site behaves exactly as
// before — no script loads, no ad slot renders, no layout change.
//
// When the publisher ID is set:
//   - the adsbygoogle.js library loads (Google's own snippet), and
//   - if NEXT_PUBLIC_ADSENSE_AD_SLOT is also set, one responsive
//     display unit renders where this component is mounted.
// Mounted ONLY on the public homepage: AdSense units must never sit
// behind login, and paying Pro users must never see ads. For extra
// placements, enable Auto Ads in the AdSense dashboard instead of
// adding more units here.
//
// Policy notes (the account-ban risks, not fine print): never click
// your own ads, never ask anyone to click them, never place units on
// login-gated pages. Invalid traffic is what gets AdSense accounts
// closed.
const PUBLISHER = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;
const SLOT = process.env.NEXT_PUBLIC_ADSENSE_AD_SLOT;

export default function AdSense() {
  useEffect(() => {
    if (!PUBLISHER || !SLOT) return;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch {
      // Ad blocker or load failure: the page must still work.
    }
  }, []);
  if (!PUBLISHER) return null;
  return (
    <>
      <script
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER}`}
        crossOrigin="anonymous"
      />
      {SLOT ? (
        <div className="mx-auto mt-12 max-w-3xl">
          <ins
            className="adsbygoogle"
            style={{ display: "block" }}
            data-ad-client={PUBLISHER}
            data-ad-slot={SLOT}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>
      ) : null}
    </>
  );
}
