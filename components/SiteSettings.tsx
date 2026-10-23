"use client";
import { useCallback, useEffect, useState } from "react";

type Banner = { enabled?: boolean; text?: string; link?: string };
type Maintenance = { enabled?: boolean; text?: string };

export default function SiteSettings() {
  const [activated, setActivated] = useState(true);
  const [banner, setBanner] = useState<Banner>({ enabled: false, text: "", link: "" });
  const [maintenance, setMaintenance] = useState<Maintenance>({ enabled: false, text: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        setActivated(d.data.activated !== false);
        if (d.data.settings?.banner) setBanner(d.data.settings.banner as Banner);
        if (d.data.settings?.maintenance) setMaintenance(d.data.settings.maintenance as Maintenance);
      }
    } catch { /* keep defaults */ }
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  async function save(key: string, value: unknown) {
    const res = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok && d.ok ? "Saved — live within a minute." : d.error || "Could not save.");
  }

  return (
    <section aria-label="Site settings">
      <h2 className="text-lg font-bold tracking-tight text-fg">Site settings</h2>
      {msg && <p className="mt-3 rounded-[var(--radius)] border border-border bg-surface p-3 text-sm text-fg" role="status">{msg}</p>}
      {!activated && (
        <p className="mt-4 rounded-[var(--radius)] border border-warning bg-warning-bg p-3 text-sm text-warning" role="note">
          Settings are not activated yet — run the latest <code>supabase/schema.sql</code> in the Supabase SQL editor to create the table.
        </p>
      )}
      <div className="card mt-4 space-y-4 p-5">
        <h3 className="font-semibold text-fg">Announcement banner</h3>
        <label className="flex min-h-[44px] items-center gap-3 text-sm text-fg">
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={!!banner.enabled} onChange={(e) => setBanner({ ...banner, enabled: e.target.checked })} />
          Show a banner at the top of every page
        </label>
        <div>
          <label className="label" htmlFor="bn-text">Banner text</label>
          <input id="bn-text" className="input" value={banner.text || ""} onChange={(e) => setBanner({ ...banner, text: e.target.value })} placeholder="Launch offer: 20% off Pro with code LAUNCH20" maxLength={160} />
        </div>
        <div>
          <label className="label" htmlFor="bn-link">Link (optional)</label>
          <input id="bn-link" className="input" value={banner.link || ""} onChange={(e) => setBanner({ ...banner, link: e.target.value })} placeholder="/checkout" maxLength={300} />
        </div>
        <button type="button" className="btn-primary px-5" onClick={() => save("banner", banner)}>Save banner</button>
      </div>
      <div className="card mt-4 space-y-4 p-5">
        <h3 className="font-semibold text-fg">Maintenance notice</h3>
        <p className="text-sm text-muted">Shows a red notice bar on every page (the site stays up). Use it for planned downtime or payment delays.</p>
        <label className="flex min-h-[44px] items-center gap-3 text-sm text-fg">
          <input type="checkbox" className="h-5 w-5 accent-[var(--danger)]" checked={!!maintenance.enabled} onChange={(e) => setMaintenance({ ...maintenance, enabled: e.target.checked })} />
          Show the maintenance notice
        </label>
        <div>
          <label className="label" htmlFor="mt-text">Notice text</label>
          <input id="mt-text" className="input" value={maintenance.text || ""} onChange={(e) => setMaintenance({ ...maintenance, text: e.target.value })} placeholder="Scheduled maintenance tonight 11 PM–12 AM NPT." maxLength={160} />
        </div>
        <button type="button" className="btn-primary px-5" onClick={() => save("maintenance", maintenance)}>Save notice</button>
      </div>
    </section>
  );
}
