"use client";

import { useCallback, useEffect, useState } from "react";

// Ask-first cookie consent banner.
//
// What this component does — and does not do:
// - It stores the visitor's choice ("accepted" | "declined") in
//   localStorage only, under CONSENT_KEY. It never writes a cookie
//   itself (no document.cookie anywhere here), so NO tracking cookie
//   is set before the visitor chooses — and no analytics or
//   advertising tracking exists on this site to gate behind it
//   (verified: no gtag/GTM/pixel/clarity-style script in the layout,
//   components, or config; the site's cookies are only for sign-in
//   and preferences).
// - IMPORTANT — do NOT "fix" this into cookie-based gating:
//   declining here must NEVER break checkout. The checkout page's
//   country-based gateway display does not read cookies at all: it
//   comes from the methods API, which reads the visitor's country
//   server-side from Vercel's `x-vercel-ip-country` edge header
//   (see app/api/payments/methods/route.ts). A Decline therefore
//   changes nothing about checkout, payments, search, or email —
//   it only records that the visitor declined optional cookies.
// - The footer "Cookie choices" control re-opens this banner by
//   dispatching REOPEN_EVENT on window, so a visitor can change
//   their choice at any time; picking again overwrites the stored
//   value.

const CONSENT_KEY = "lfg-cookie-consent";
export const REOPEN_EVENT = "lfg:reopen-cookie-consent";

type Choice = "accepted" | "declined";

function readChoice(): Choice | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "declined" ? v : null;
  } catch {
    return null;
  }
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // First visit: no stored choice yet, so ask. Returning visitors
    // with a stored choice see nothing until they re-open it.
    if (readChoice() === null) setVisible(true);
    const reopen = () => setVisible(true);
    window.addEventListener(REOPEN_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_EVENT, reopen);
  }, []);

  const choose = useCallback((choice: Choice) => {
    try {
      localStorage.setItem(CONSENT_KEY, choice);
    } catch {
      // Private-mode storage failure: hiding the banner for this
      // visit is still better than trapping the visitor behind it.
    }
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface shadow-lg safe-b"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
        <p className="flex-1 text-sm leading-relaxed text-muted">
          <span className="font-bold text-fg">Cookies, your choice. </span>
          We use cookies only to keep you signed in and remember preferences
          such as your theme. We run no analytics or advertising tracking on
          this site, and we set no tracking cookie before you choose. You can
          change this anytime from “Cookie choices” in the footer.
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn-primary px-5 py-2 text-sm" onClick={() => choose("accepted")}>
            Accept
          </button>
          <button type="button" className="btn-ghost px-5 py-2 text-sm" onClick={() => choose("declined")}>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

// Footer control (also a client component, so it can live in the
// server-rendered layout footer): re-opens the banner above so a
// visitor can change a previously stored choice.
export function CookieChoicesButton() {
  return (
    <button
      type="button"
      className="text-muted hover:text-fg"
      onClick={() => window.dispatchEvent(new Event(REOPEN_EVENT))}
    >
      Cookie choices
    </button>
  );
}
