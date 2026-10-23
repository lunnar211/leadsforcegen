import Link from "next/link";
import Reveal from "@/components/Reveal";

// Landing page v2 (2026-10-23) — "designed, not vibe-coded":
// product visual in the hero (real leads from the live database),
// restrained palette (one accent word, orange only for CTAs),
// hairline borders, deep soft shadows, scroll-reveal motion,
// provenance strip instead of fake logos, rich closing CTA band.

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const Icons = {
  target: (
    <svg {...iconProps}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>
  ),
  database: (
    <svg {...iconProps}><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>
  ),
  sparkles: (
    <svg {...iconProps}><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" /><path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" /></svg>
  ),
  mail: (
    <svg {...iconProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
  ),
  download: (
    <svg {...iconProps}><path d="M12 3v11m0 0 4-4m-4 4-4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
  ),
  shield: (
    <svg {...iconProps}><path d="M12 3l7 2.8v5.4c0 4.6-3 7.7-7 9.3-4-1.6-7-4.7-7-9.3V5.8L12 3z" /><path d="m9 11.6 2.2 2.2L15.4 9.6" /></svg>
  ),
};

const features = [
  { icon: Icons.target, title: "Any lead type", text: "Search by industry and city — dentists, restaurants, hotels, clinics, schools, agencies and hundreds more categories." },
  { icon: Icons.database, title: "Real business data", text: "Leads come from a stored database of real businesses and their own websites — names, phones, emails, socials. Never demo data." },
  { icon: Icons.sparkles, title: "AI scoring", text: "Every prospect gets a fit score with verified contacts first, so you work the best leads before the rest." },
  { icon: Icons.mail, title: "AI outreach", text: "Generate a personalized outreach message for any lead in one click — with the opt-out line built in." },
  { icon: Icons.download, title: "Excel & CSV export", text: "Export up to 500 leads per search on Pro, ready for your CRM or outreach tool." },
  { icon: Icons.shield, title: "Private by design", text: "Your searches, leads and payments are visible only to you — enforced in the database itself, audited and verified." },
];

const stats = [
  ["1M+", "businesses in the database"],
  ["87%+", "of leads publish a phone"],
  ["500", "leads per Pro search"],
  ["24/7", "Telegram admin bot"],
];

const steps = [
  ["Search", "Pick an industry and a city — Dubai, Kathmandu, New York and more."],
  ["Get real leads", "Real businesses with the contacts they publish, scored and source-linked."],
  ["Reach out", "Export to Excel/CSV or generate AI outreach and start conversations."],
];

// Real rows from the live places database (verified 2026-10-23) — the
// hero shows the actual product, not a stock illustration.
const mockLeads = [
  { name: "Dr. Michael's Dental Clinic", meta: "Dental Clinic · Dubai", contact: "+971 4 330 0441", score: 94 },
  { name: "Same Day Dental Implants", meta: "Dental Clinic · Dubai", contact: "info@samedayme.com", score: 91 },
  { name: "Oris Dental Centre", meta: "Dental Clinic · Dubai", contact: "Website · Socials", score: 88 },
];

function DashboardMock() {
  return (
    <div className="relative mx-auto mt-14 max-w-3xl" aria-hidden="true">
      <div className="absolute -inset-8 rounded-[36px] opacity-60 blur-2xl" style={{ background: "linear-gradient(120deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--cta) 18%, transparent))" }} />
      <div className="card relative overflow-hidden text-left shadow-[var(--shadow-lg)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#f87171" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#fbbf24" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#34d399" }} />
          <span className="ml-3 hidden rounded-md bg-surface px-3 py-1 text-xs text-muted sm:block">leadsforcegen.vercel.app/dashboard</span>
        </div>
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-fg">Industry: <strong>Dentist</strong></span>
            <span className="rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-fg">City: <strong>Dubai</strong></span>
            <span className="rounded-lg px-4 py-2 text-sm font-bold text-accent-fg" style={{ background: "var(--accent)" }}>Find leads</span>
            <span className="ml-auto hidden rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg sm:block">Download Excel</span>
          </div>
          {mockLeads.map((l) => (
            <div key={l.name} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">{l.name}</p>
                <p className="truncate text-xs text-muted">{l.meta} · {l.contact}</p>
              </div>
              <span className="ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "var(--success-bg)", color: "var(--success)" }}>{l.score} fit</span>
            </div>
          ))}
          <p className="pt-1 text-center text-[11px] text-muted">Real businesses from the live LeadsForceGen database</p>
        </div>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-[3px] shrink-0 text-success" aria-hidden="true"><path d="m4.5 12.5 5 5 10-11" /></svg>
  );
}
function Cross() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="mt-[3px] shrink-0 text-muted" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
  );
}

function Eyebrow({ children }: { children: string }) {
  return <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-accent-text">{children}</p>;
}

export default function Home() {
  return (
    <div className="hero-mesh">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-12 sm:pt-16">
        <section className="text-center">
          <p className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-fg shadow-sm">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            1,000,000+ verified businesses live — UAE · Nepal · New York · Seattle
          </p>
          <h1 className="mx-auto mt-7 max-w-3xl text-[2.6rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg sm:text-6xl lg:text-[4.2rem]">
            Find <span className="text-accent-text">real business leads</span>, anywhere.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            Search real companies by industry and city, get the contacts they publish — phone, email, website, socials — scored by AI and ready to export. Free to start, unlimited* on Pro.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-cta">Start free — no card needed</Link>
            <Link href="/dashboard" className="btn-ghost">Open the dashboard</Link>
          </div>
          <p className="mt-3 text-xs text-muted">Free: 30 leads/day · Pro: unlimited* leads (fair use)</p>

          <DashboardMock />

          <dl className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-y-7 lg:grid-cols-4" aria-label="Platform numbers">
            {stats.map(([n, label]) => (
              <div key={label} className="flex flex-col px-2">
                <dd className="order-1 text-3xl font-extrabold tracking-tight text-fg">{n}</dd>
                <dt className="order-2 mt-1 text-xs font-medium text-muted">{label}</dt>
              </div>
            ))}
          </dl>

          <p className="mt-12 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Built on public business data · Overture Maps · OpenStreetMap · each business&rsquo;s own website
          </p>
        </section>

        <Reveal className="mt-24">
          <Eyebrow>Features</Eyebrow>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-fg">Everything you need to fill a pipeline</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="card card-hover p-6">
                <span className="inline-flex rounded-xl p-2.5 text-accent-text" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }} aria-hidden="true">{f.icon}</span>
                <h3 className="mt-4 font-semibold text-fg">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal className="mt-24">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-fg">From search to conversation in minutes</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map(([t, d], i) => (
              <div key={t} className="card p-6">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold text-accent-fg" style={{ background: "var(--accent)" }} aria-hidden="true">{i + 1}</span>
                <h3 className="mt-4 font-semibold text-fg">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal className="mt-24">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-fg">Start free. Upgrade when it pays.</h2>
          <div className="mx-auto mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
            <div className="card card-hover p-6">
              <h3 className="text-xl font-bold text-fg">Free</h3>
              <p className="mt-2 text-4xl font-extrabold text-fg">$0</p>
              <ul className="mt-5 space-y-2.5 text-sm text-muted">
                <li className="flex gap-2"><Check />30 leads per day</li>
                <li className="flex gap-2"><Check />AI lead scoring</li>
                <li className="flex gap-2"><Check />Search history</li>
                <li className="flex gap-2"><Cross />No Excel/CSV export</li>
                <li className="flex gap-2"><Cross />Limited AI outreach</li>
              </ul>
              <Link href="/signup" className="btn-ghost btn-block mt-7">Start free</Link>
            </div>
            <div className="card card-hover relative p-6" style={{ borderColor: "var(--cta)", borderWidth: 2 }}>
              <span className="absolute -top-3 right-5 rounded-full px-3 py-1 text-xs font-bold text-cta-fg" style={{ background: "var(--cta)" }}>Most popular</span>
              <h3 className="text-xl font-bold text-fg">Pro</h3>
              <p className="mt-2 text-4xl font-extrabold text-fg">$19<span className="text-base font-medium text-muted">/mo</span></p>
              <ul className="mt-5 space-y-2.5 text-sm text-muted">
                <li className="flex gap-2"><Check />Unlimited* leads (fair use)</li>
                <li className="flex gap-2"><Check />Up to 500 leads per search</li>
                <li className="flex gap-2"><Check />Excel & CSV export</li>
                <li className="flex gap-2"><Check />Full AI outreach generator</li>
                <li className="flex gap-2"><Check />Secure worldwide checkout</li>
              </ul>
              <Link href="/checkout" className="btn-cta btn-block mt-7">Upgrade to Pro</Link>
            </div>
          </div>
        </Reveal>

        <Reveal className="mt-24">
          <div className="relative overflow-hidden rounded-[calc(var(--radius)+10px)] px-6 py-12 text-center shadow-[var(--shadow-lg)]" style={{ background: "linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--cta)))" }}>
            <h2 className="text-3xl font-extrabold tracking-tight text-white">Your next customer is already in the database.</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/85">Join free, run your first search in under a minute, and see real businesses — not samples.</p>
            <Link href="/signup" className="mt-7 inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius)] bg-white px-6 py-3 font-bold text-slate-900 shadow-lg transition-transform hover:-translate-y-0.5">Start free</Link>
          </div>
        </Reveal>

        <p className="mx-auto mt-12 max-w-2xl text-center text-xs leading-relaxed text-muted">
          Leads are company-level prospects from public business data. Every lead shows its source so you can verify it before outreach. LeadsForceGen never sells personal phone numbers or personal emails, and never scrapes social media or Google.
        </p>
      </div>
    </div>
  );
}
