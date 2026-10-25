"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// The Pro user's own control panel, rendered inside the dashboard only
// when the server-reported plan is 'pro' (the dashboard gates the tab
// itself, and every API below re-checks the plan server-side). It shows
// real data only: usage from /api/usage, the device's own search
// history with one-tap re-runs, and the bulk-email campaign summary
// from the Pro-gated /api/email/campaigns route.
type HistoryItem = { at: string; industry: string; location: string; count: number };
type UsageState = { configured: boolean; plan: string; used: number; limit: number; remaining: number; email?: string };
type Campaign = { id: string; subject: string; status: string; total: number; sent: number; failed: number; opened: number; clicked: number; created_at: string };

export default function ProPanel({
  usage,
  history,
  onReRun,
  authHeaders,
}: {
  usage: UsageState | null;
  history: HistoryItem[];
  onReRun: (item: HistoryItem) => void;
  authHeaders: () => Promise<Record<string, string>>;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [campaignsError, setCampaignsError] = useState("");

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/email/campaigns", { headers: await authHeaders() });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok && Array.isArray(d.data)) setCampaigns(d.data as Campaign[]);
      else setCampaignsError(d.error || "Could not load campaigns.");
    } catch {
      setCampaignsError("Could not load campaigns.");
    }
  }, [authHeaders]);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);

  const sentTotal = campaigns ? campaigns.reduce((s, c) => s + (c.sent || 0), 0) : 0;

  return (
    <div className="space-y-4">
      <section className="card p-5" aria-label="Account and plan">
        <h2 className="font-semibold text-fg">Your Pro account</h2>
        {usage === null ? (
          <div className="skeleton mt-4 h-5 w-3/4" aria-hidden="true" />
        ) : (
          <dl className="mt-3 space-y-1.5 text-sm">
            {usage.email && <div className="flex gap-2"><dt className="text-muted">Account</dt><dd className="break-all font-medium text-fg">{usage.email}</dd></div>}
            <div className="flex gap-2"><dt className="text-muted">Plan</dt><dd className="font-medium text-fg">Pro</dd></div>
            <div className="flex gap-2"><dt className="text-muted">Leads used today</dt><dd className="font-medium text-fg">{usage.used} / {usage.limit} (fair-use limit) · {usage.remaining} remaining</dd></div>
          </dl>
        )}
      </section>

      <section className="card p-5" aria-label="Bulk email campaigns">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold text-fg">Bulk email</h2>
          <Link href="/bulk-email" className="btn-ghost ml-auto px-3 py-1.5 text-xs">Open bulk email panel</Link>
        </div>
        {campaigns === null && !campaignsError ? (
          <div className="skeleton mt-4 h-5 w-3/4" aria-hidden="true" />
        ) : campaignsError ? (
          <p className="mt-3 text-sm text-muted">{campaignsError}</p>
        ) : campaigns!.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No campaigns yet — compose your first one in the bulk email panel.</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted">{campaigns!.length} campaign{campaigns!.length === 1 ? "" : "s"} · {sentTotal} emails sent in total</p>
            <ul className="mt-3 space-y-2 text-sm">
              {campaigns!.slice(0, 5).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <span className="font-medium text-fg">{c.subject || "Untitled campaign"}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold capitalize text-muted">{c.status}</span>
                  <span className="ml-auto text-muted">{c.sent}/{c.total} sent · {c.opened} opened · {c.clicked} clicked</span>
                  <span className="text-xs text-muted">{String(c.created_at).slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card p-5" aria-label="Recent searches">
        <h2 className="font-semibold text-fg">Recent searches</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No searches yet — your recent searches will appear here after your first Find leads.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {history.slice(0, 10).map((h, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 first:border-t-0 first:pt-0">
                <span className="font-medium text-fg">{h.industry || "Any industry"} · {h.location || "Any location"}</span>
                <span className="text-muted">{h.count} leads</span>
                <button type="button" onClick={() => onReRun(h)} className="ml-auto text-xs text-accent-text underline">↻ Re-run</button>
                <span className="text-xs text-muted">{new Date(h.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
