"use client";
import { useEffect, useState } from "react";

type Notice = { enabled?: boolean; text?: string; link?: string };

// Site-wide notice bar driven by /api/settings (owner-controlled from
// Admin → Settings). Maintenance notice (red) wins over the promo
// banner (gradient). Dismissal is remembered for the session only.
export default function SiteBanner() {
  const [notice, setNotice] = useState<{ text: string; link?: string; kind: "banner" | "maintenance" } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const d = await res.json().catch(() => ({}));
        const m = d?.data?.maintenance as Notice | null;
        const b = d?.data?.banner as Notice | null;
        const pick = m?.enabled && m.text ? { text: m.text, kind: "maintenance" as const }
          : b?.enabled && b.text ? { text: b.text, link: b.link, kind: "banner" as const }
          : null;
        if (pick && sessionStorage.getItem("lfg-banner-dismissed") !== pick.text) setNotice(pick);
      } catch { /* no banner is a fine default */ }
    })();
  }, []);

  if (!notice) return null;
  const inner = (
    <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 px-10 text-center text-[13px] font-semibold leading-snug">
      <span>{notice.text}</span>
      {notice.link && <span className="underline underline-offset-2">Learn more</span>}
    </span>
  );
  return (
    <div
      className="relative py-2 text-white"
      style={{ background: notice.kind === "maintenance" ? "var(--danger)" : "linear-gradient(90deg, var(--accent), var(--cta))" }}
      role="status"
    >
      {notice.link ? <a href={notice.link} className="block text-white no-underline">{inner}</a> : inner}
      <button
        type="button" aria-label="Dismiss"
        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15"
        onClick={() => { sessionStorage.setItem("lfg-banner-dismissed", notice.text); setNotice(null); }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg>
      </button>
    </div>
  );
}
