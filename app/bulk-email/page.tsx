"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Settings = { provider: string; senderName: string; senderEmail: string; webhookUrl: string | null; keySet: boolean };
type Campaign = { id: string; subject: string; template: string; status: string; total: number; sent: number; failed: number; opened: number; clicked: number; unsubscribed: number; created_at: string; auto_drain?: boolean };
type RecipientRow = { email: string; status: string; opened_at: string | null; clicked_at: string | null; unsubscribed_at: string | null; error: string | null };

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
function extract(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of raw.match(EMAIL_RE) || []) {
    const e = m.toLowerCase();
    if (!e.includes("..") && !seen.has(e)) { seen.add(e); out.push(e); }
  }
  return out;
}
function toHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const linked = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return linked.replace(/\n/g, "<br>");
}

export default function BulkEmail() {
  const [plan, setPlan] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  // SMTP (Gmail) is the default: it needs no API key — just a Gmail
  // address + app password. Brevo/Resend stay as alternatives below.
  const [prov, setProv] = useState("smtp");
  const [apiKey, setApiKey] = useState("");
  const [smtp, setSmtp] = useState({ host: "smtp.gmail.com", port: "587", user: "", pass: "" });
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [template, setTemplate] = useState("simple");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [paste, setPaste] = useState("");
  const [extracted, setExtracted] = useState<string[]>([]);
  const [verified, setVerified] = useState<{ valid: string[]; invalid: string[] } | null>(null);
  const [attachments, setAttachments] = useState<{ name: string; content: string; type: string }[]>([]);
  const [attachErr, setAttachErr] = useState("");
  // Auto-drain is opt-in per campaign (default off) and text-only.
  const [autoDrain, setAutoDrain] = useState(false);
  const [lastAutoDrain, setLastAutoDrain] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendResult, setSendResult] = useState<{ campaignId: string; sent: number; failed: number; queued: number; blocked: number } | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [testOk, setTestOk] = useState(false);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [detail, setDetail] = useState<{ campaign: Campaign; recipients: RecipientRow[] } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const headers = useCallback(async (): Promise<Record<string, string>> => {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const load = useCallback(async () => {
    const h = await headers();
    const u = await fetch("/api/usage", { headers: h }).then((r) => r.json()).catch(() => ({}));
    if (u.data) setPlan(u.data.plan as string);
    const s = await fetch("/api/email/settings", { headers: h }).then((r) => r.json()).catch(() => ({}));
    if (s.ok && s.data) {
      setSettings(s.data as Settings);
      setProv(s.data.provider);
      setSenderName(s.data.senderName);
      setSenderEmail(s.data.senderEmail);
      setWebhookUrl(s.data.webhookUrl || "");
    }
    const c = await fetch("/api/email/campaigns", { headers: h }).then((r) => r.json()).catch(() => ({}));
    if (c.ok) setCampaigns(c.data as Campaign[]);
  }, [headers]);

  useEffect(() => { void load(); }, [load]);

  async function saveSettings() {
    setSaveMsg("");
    const h = await headers();
    const payload: Record<string, unknown> = { provider: prov, senderName, senderEmail, webhookUrl };
    if (prov === "smtp") payload.host = smtp.host, payload.port = smtp.port, payload.user = smtp.user, payload.pass = smtp.pass;
    else payload.apiKey = apiKey;
    const r = await fetch("/api/email/settings", { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((x) => x.json()).catch(() => ({}));
    setSaveMsg(r.ok ? "Settings saved. Your credentials are stored encrypted." : (r.error || "Could not save settings."));
    if (r.ok) void load();
  }

  async function testSend() {
    setTestSending(true);
    setTestMsg("");
    const h = await headers();
    const r = await fetch("/api/email/test", { method: "POST", headers: h }).then((x) => x.json()).catch(() => ({}));
    setTestSending(false);
    if (r.ok) {
      setTestOk(true);
      setTestMsg(`Test email sent to ${r.data?.to || senderEmail}. Check your inbox (and spam folder).`);
    } else {
      setTestOk(false);
      setTestMsg(r.error || "Test email failed.");
    }
  }

  function onCsvFile(f: File | undefined) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPaste((p) => (p ? p + "\n" : "") + String(reader.result || ""));
    reader.readAsText(f);
  }

  async function verify() {
    const list = extract(paste);
    setExtracted(list);
    if (!list.length) { setVerified({ valid: [], invalid: [] }); return; }
    const h = await headers();
    const r = await fetch("/api/email/verify", { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ emails: list }) }).then((x) => x.json()).catch(() => ({}));
    if (r.ok) setVerified({ valid: r.data.valid as string[], invalid: r.data.invalid as string[] });
  }

  async function onAttach(files: FileList | null) {
    setAttachErr("");
    if (!files) return;
    const picked = Array.from(files).slice(0, 3);
    const encoded: { name: string; content: string; type: string }[] = [];
    let total = 0;
    for (const f of picked) {
      total += f.size;
      if (total > 2 * 1024 * 1024) { setAttachErr("Attachments total over 2 MB."); return; }
      const buf = await f.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      encoded.push({ name: f.name, content: btoa(bin), type: f.type });
    }
    setAttachments(encoded);
  }

  async function stopAutoDrain(id: string) {
    const h = await headers();
    const r = await fetch("/api/email/campaigns", { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: id, action: "stop" }) }).then((x) => x.json()).catch(() => ({}));
    if (r.ok) void load();
    else setSendError(r.error || "Could not stop auto-drain.");
  }

  async function send(resumeId?: string) {
    setSending(true);
    setSendError("");
    setSendResult(null);
    setLastAutoDrain(!resumeId && autoDrain);
    const h = await headers();
    const payload: Record<string, unknown> = resumeId
      ? { campaignId: resumeId, subject, template, bodyHtml: toHtml(message), attachments }
      : { subject, template, bodyHtml: toHtml(message), recipients: verified?.valid ?? extracted, attachments, autoDrain };
    const r = await fetch("/api/email/send", { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((x) => x.json()).catch(() => ({}));
    setSending(false);
    if (r.ok) {
      setSendResult(r.data);
      void load();
    } else {
      setSendResult(null);
      setSendError(r.error || "Send failed. Check your provider settings and try again.");
    }
  }

  async function openCampaign(id: string) {
    const h = await headers();
    const r = await fetch(`/api/email/campaigns?campaignId=${encodeURIComponent(id)}`, { headers: h }).then((x) => x.json()).catch(() => ({}));
    if (r.ok) setDetail(r.data);
  }

  if (plan !== null && plan !== "pro") {
    return (
      <main className="mx-auto w-full max-w-[900px] px-4 py-10">
        <h1 className="text-3xl font-bold">Bulk Email</h1>
        <section className="card mt-6 space-y-4 p-5">
          <p className="text-muted">Bulk email is a Pro feature. Pro members get their own panel: compose, paste or upload contacts, track who opened and who clicked, attach files, and fire webhooks on every event.</p>
          <Link href="/checkout" className="btn-primary">Go Pro — $19/mo</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-10">
      <h1 className="text-3xl font-bold">Bulk Email</h1>
      <p className="mt-1 text-sm text-muted">Send only to people who gave you permission. Every mail carries an unsubscribe link, and unsubscribed addresses are never mailed again.</p>
      <p className="mt-2 text-sm text-muted">Why a provider at all? Email has to leave from a real mail server — there is no free keyless sender. A shared keyless server would get blacklisted within days and nobody&apos;s mail would arrive, so every mail here goes out through your own free provider account instead. This panel itself charges nothing per email: the daily ceiling is your provider&apos;s free tier (Gmail SMTP 500/day, Brevo 300/day, Resend 100/day). A list bigger than one day&apos;s ceiling drains day by day — unsent addresses stay queued and the Resume button sends the next batch. Tick Auto-drain at compose time and the queue continues automatically each day instead — still never above your provider&apos;s daily cap.</p>

      <section className="card mt-6 space-y-4 p-5" aria-label="Provider settings">
        <h2 className="text-xl font-bold">1. Your sending provider (free)</h2>
        <div>
          <label className="label" htmlFor="be-prov">Provider</label>
          <select id="be-prov" className="input" value={prov} onChange={(e) => setProv(e.target.value)}>
            <option value="smtp">Gmail — no API key needed (SMTP, 500/day free)</option>
            <option value="brevo">Brevo — API key needed (300/day free)</option>
            <option value="resend">Resend — API key needed (100/day free)</option>
          </select>
        </div>
        {prov === "smtp" ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="be-user">Gmail address</label><input id="be-user" className="input" placeholder="you@gmail.com" value={smtp.user} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} /></div>
              <div><label className="label" htmlFor="be-pass">Gmail app password</label><input id="be-pass" className="input" type="password" placeholder="16-character app password" value={smtp.pass} onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })} autoComplete="off" /></div>
            </div>
            <p className="text-sm text-muted">Get an app password: Google Account → Security → turn on 2-Step Verification → App passwords → generate one for Mail → paste it here. Never paste your normal Gmail password — Google blocks that, and an app password can be revoked any time. <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Open Google App passwords</a>.</p>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Advanced: custom mail server</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div><label className="label" htmlFor="be-host">SMTP host</label><input id="be-host" className="input" placeholder="smtp.gmail.com" value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} /></div>
                <div><label className="label" htmlFor="be-port">Port</label><input id="be-port" className="input" placeholder="587" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: e.target.value })} /></div>
              </div>
              <p className="mt-2 text-xs text-muted">Saved server details are never shown here; saving replaces them. For Gmail, leave these at smtp.gmail.com / 587.</p>
            </details>
          </div>
        ) : (
          <div>
            <p className="mb-2 text-sm text-muted">Brevo and Resend work by API key — that is their design, not a choice of this panel. Create a free account with them, copy the key, and paste it here.</p>
            <label className="label" htmlFor="be-key">API key {settings?.keySet ? "(saved — paste a new one to replace it)" : ""}</label><input id="be-key" className="input" type="password" placeholder={prov === "brevo" ? "xkeysib-…" : "re_…"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="be-sname">Sender name</label><input id="be-sname" className="input" value={senderName} onChange={(e) => setSenderName(e.target.value)} /></div>
          <div><label className="label" htmlFor="be-semail">Sender email</label><input id="be-semail" className="input" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} /></div>
        </div>
        <div><label className="label" htmlFor="be-hook">Webhook URL <span className="font-normal text-muted">(optional — gets sent/opened/clicked/unsubscribed events)</span></label><input id="be-hook" className="input" placeholder="https://your-site.com/hooks/email" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} /></div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" onClick={() => void saveSettings()}>Save settings</button>
          <button type="button" className="btn-ghost" disabled={testSending || !settings?.keySet} onClick={() => void testSend()}>
            {testSending ? "Sending test…" : "Send test email to myself"}
          </button>
        </div>
        {!settings?.keySet && <p className="text-xs text-muted">Save your settings first — the test email goes to your sender address using those saved settings.</p>}
        {saveMsg && <p className="text-sm text-muted">{saveMsg}</p>}
        {testMsg && <p className={`text-sm ${testOk ? "text-success" : "text-danger"}`} role={testOk ? "status" : "alert"}>{testMsg}</p>}
      </section>

      <section className="card mt-6 space-y-4 p-5" aria-label="Compose campaign">
        <h2 className="text-xl font-bold">2. Compose</h2>
        <div><label className="label" htmlFor="be-tpl">Template</label><select id="be-tpl" className="input" value={template} onChange={(e) => setTemplate(e.target.value)}><option value="simple">Simple</option><option value="announcement">Announcement</option><option value="offer">Offer</option></select></div>
        <div><label className="label" htmlFor="be-subj">Subject</label><input id="be-subj" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div><label className="label" htmlFor="be-msg">Message</label><textarea id="be-msg" className="input min-h-[160px]" placeholder="Write your message. Links become clickable and tracked automatically." value={message} onChange={(e) => setMessage(e.target.value)} /></div>
        <div>
          <label className="label" htmlFor="be-files">Attachments <span className="font-normal text-muted">(up to 3 files, 2 MB total — like Gmail)</span></label>
          <input id="be-files" className="input" type="file" multiple onChange={(e) => void onAttach(e.target.files)} />
          {attachErr && <p className="field-error">{attachErr}</p>}
          {attachments.length > 0 && <p className="mt-1 text-xs text-muted">{attachments.map((a) => a.name).join(", ")}</p>}
        </div>
        <div className="space-y-1">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={autoDrain} disabled={attachments.length > 0} onChange={(e) => setAutoDrain(e.target.checked)} />
            <span>
              <span className="font-medium">Auto-drain daily until done</span>
              <span className="block text-muted">Auto-drain sends up to your provider&apos;s daily limit each day until the list is done. It never exceeds the daily cap. No manual Resume clicks needed (up to 5,000 recipients per auto-drain campaign).</span>
            </span>
          </label>
          {attachments.length > 0 && <p className="text-sm text-muted">Auto-drain is text-only; campaigns with attachments use manual Resume.</p>}
        </div>
      </section>

      <section className="card mt-6 space-y-4 p-5" aria-label="Recipients">
        <h2 className="text-xl font-bold">3. Recipients — paste or upload</h2>
        <div>
          <label className="label" htmlFor="be-paste">Paste emails (any text — only email addresses are kept)</label>
          <textarea id="be-paste" className="input min-h-[120px]" placeholder={"anna@example.com, ben@example.com\n…or paste a whole list"} value={paste} onChange={(e) => setPaste(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="be-csv">Or upload a CSV file <span className="font-normal text-muted">(Excel: save as CSV first)</span></label>
          <input id="be-csv" ref={fileRef} className="input" type="file" accept=".csv,.txt" onChange={(e) => onCsvFile(e.target.files?.[0])} />
        </div>
        <button type="button" className="btn-primary" onClick={() => void verify()}>Filter &amp; verify</button>
        {extracted.length > 0 && (
          <p className="text-sm text-muted">
            Found {extracted.length} addresses{verified ? ` — ${verified.valid.length} valid (mail server exists), ${verified.invalid.length} dead.` : " — verifying…"}
          </p>
        )}
        {verified && verified.invalid.length > 0 && (
          <p className="text-sm text-muted break-words">Dead addresses (won&apos;t be sent): {verified.invalid.slice(0, 20).join(", ")}{verified.invalid.length > 20 ? "…" : ""}</p>
        )}
        <button type="button" className="btn-primary btn-block" disabled={sending || !(verified?.valid.length || extracted.length)} onClick={() => void send()}>
          {sending ? "Sending…" : `Send to ${(verified?.valid ?? extracted).length} recipients (max 50 per send; daily cap follows your provider's free tier)`}
        </button>
        {sendError && <p className="rounded-[var(--radius)] bg-danger-bg p-3 text-sm text-danger" role="alert">{sendError}</p>}
        {sendResult && (
          <div className="rounded-lg border border-border p-3 text-sm">
            <p>Sent: {sendResult.sent} · Failed: {sendResult.failed} · Still queued: {sendResult.queued} · Blocked (unsubscribed): {sendResult.blocked}</p>
            {sendResult.queued > 0 && lastAutoDrain && (
              <p className="mt-2 text-muted">Auto-drain is on — the rest will send automatically each day within your provider&apos;s cap. You can stop it from the campaign list below.</p>
            )}
            {sendResult.queued > 0 && (
              <button type="button" className="btn-primary mt-2" onClick={() => void send(sendResult.campaignId)}>Resume queued</button>
            )}
          </div>
        )}
      </section>

      <section className="card mt-6 space-y-4 p-5" aria-label="Campaigns">
        <h2 className="text-xl font-bold">4. Campaigns — who saw it, who clicked it</h2>
        {campaigns.length === 0 && <p className="text-sm text-muted">No campaigns yet.</p>}
        {campaigns.map((c) => (
          <div key={c.id} className="rounded-lg border border-border p-3">
            <button type="button" className="w-full text-left" onClick={() => void openCampaign(c.id)}>
              <span className="font-medium">{c.subject}</span>
              <span className="block text-sm text-muted">{c.status} · sent {c.sent}/{c.total} · opened {c.opened} · clicked {c.clicked} · unsubscribed {c.unsubscribed} · {new Date(c.created_at).toLocaleString()}</span>
            </button>
            <p className="mt-1 text-xs text-muted">Auto-drain: {c.auto_drain ? (c.status === "done" ? "Done" : "On") : "Off"}</p>
            {c.auto_drain && c.status !== "done" && (
              <button type="button" className="btn-ghost mt-1 px-3 py-1 text-xs" onClick={() => void stopAutoDrain(c.id)}>Stop auto-drain</button>
            )}
          </div>
        ))}
        {detail && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted"><th className="py-2 pr-3">Email</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Opened</th><th className="py-2">Clicked</th></tr></thead>
              <tbody>
                {detail.recipients.map((r) => (
                  <tr key={r.email} className="border-t border-border">
                    <td className="py-2 pr-3 break-words">{r.email}</td>
                    <td className="py-2 pr-3">{r.status}{r.unsubscribed_at ? " (unsubscribed)" : ""}</td>
                    <td className="py-2 pr-3">{r.opened_at ? "Yes" : "—"}</td>
                    <td className="py-2">{r.clicked_at ? "Yes" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
