"use client";
import { useState } from "react";

// System health (owner-only): runs the pipeline diagnostics endpoint
// (/api/admin/diag) live from the server and renders every stage —
// geocoding, the map-data mirrors, the OSM API fallback, AI key validity
// AND tiny generation tests, and the cache table. This is the same X-ray
// used to trace the "search returns samples" problem to the map mirrors.
type Stage = { stage: string; ok: boolean; ms: number; detail: string };

export default function AdminHealth() {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [at, setAt] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/admin/diag");
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { setError(d.error || "Diagnostics failed to run."); setStages(null); return; }
      setStages(d.stages as Stage[]);
      setAt(String(d.at || ""));
    } catch {
      setError("Could not reach the diagnostics endpoint.");
      setStages(null);
    } finally { setRunning(false); }
  }

  const bad = stages ? stages.filter((s) => !s.ok).length : 0;

  return (
    <section aria-label="System health">
      <h2 className="font-semibold text-fg mt-10">🩺 System health</h2>
      <p className="mt-1 text-sm text-muted">
        Runs every pipeline stage live from the server — location lookup, map data sources, AI keys and test generations, and the results cache — and shows exactly which stage is healthy or broken.
      </p>
      <button onClick={() => void run()} disabled={running} className="btn-primary mt-3 px-4 py-2 text-sm" aria-busy={running}>
        {running ? "Running checks…" : "Run diagnostics"}
      </button>
      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      {stages && (
        <div className="card mt-4 overflow-x-auto">
          <p className="p-4 pb-2 text-sm text-fg">
            {bad === 0 ? "✅ All stages healthy." : `⚠️ ${bad} stage${bad === 1 ? "" : "s"} failing — the red rows below are where to look.`}
            {at && <span className="text-muted"> Ran at {at.slice(0, 19).replace("T", " ")} UTC.</span>}
          </p>
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-muted"><tr><th className="p-3">Stage</th><th className="p-3">Status</th><th className="p-3">Time</th><th className="p-3">Detail</th></tr></thead>
            <tbody>{stages.map((s) => (
              <tr key={s.stage} className="border-t border-border">
                <td className="p-3 text-fg whitespace-nowrap">{s.stage}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>{s.ok ? "OK" : "FAILING"}</span>
                </td>
                <td className="p-3 whitespace-nowrap">{s.ms} ms</td>
                <td className="p-3 text-muted">{s.detail}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
