"use client";
import { useState } from "react";
import Link from "next/link";
import type { SampleTab } from "@/lib/sampleLeads";

// The homepage product proof: a real, readable lead table — the
// directory itself, not a mock screenshot. Rows are real businesses
// fetched server-side at build time (see lib/sampleLeads.ts); this
// component only switches between the two sample tabs.
export default function SampleLeadTable({ tabs }: { tabs: SampleTab[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  if (!active) return null;

  return (
    <div className="mx-auto mt-10 max-w-4xl text-left">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-fg pb-3">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-accent-text">
            Sample search — try it
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-fg sm:text-2xl">
            This is what a search returns
          </h2>
        </div>
        <div className="flex gap-2" role="tablist" aria-label="Sample searches">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active.id === t.id}
              onClick={() => setActiveId(t.id)}
              className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                active.id === t.id
                  ? "border-transparent bg-accent text-accent-fg"
                  : "border-border bg-card text-fg hover:border-input-border"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <caption className="sr-only">
            Sample leads: {active.label}. Real businesses from the LeadsForceGen database.
          </caption>
          <thead>
            <tr className="border-b border-border text-left font-mono text-xs uppercase tracking-[0.12em] text-muted">
              <th scope="col" className="py-3 pr-4 font-semibold">Business</th>
              <th scope="col" className="py-3 pr-4 font-semibold">Published contact</th>
              <th scope="col" className="py-3 pr-4 font-semibold">Score</th>
              <th scope="col" className="py-3 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {active.rows.map((r) => (
              <tr key={r.name} className="border-b border-border align-top">
                <td className="py-3 pr-4">
                  <span className="block font-semibold text-fg">{r.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">{r.meta}</span>
                </td>
                <td className="py-3 pr-4 font-mono text-[13px] text-fg break-words">
                  {r.website && r.contactKind !== "website" ? (
                    <a href={r.website} target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-2">
                      {r.contact}
                    </a>
                  ) : (
                    r.contact
                  )}
                </td>
                <td className="py-3 pr-4">
                  <span className="rounded-md bg-success-bg px-2 py-1 font-mono text-xs font-bold text-success">
                    {r.score}
                  </span>
                </td>
                <td className="py-3 font-mono text-[11px] leading-relaxed text-muted">
                  Source: {r.source}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p>
          {active.live
            ? "Live from the LeadsForceGen database — refreshed daily."
            : "Sample from the live database, verified 23 Oct 2026."}{" "}
          Score = published phone + email + website + source quality.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/leads/dubai/dentists" className="font-semibold text-accent-text underline underline-offset-2">
            All dentists in Dubai →
          </Link>
          <Link href="/signup" className="font-semibold text-accent-text underline underline-offset-2">
            Run your own search →
          </Link>
        </p>
      </div>
    </div>
  );
}
