import Link from "next/link";

// Landing page — redesigned 2026-10-23 to the LeadsForceGen design
// system (UI/UX Pro Max): Plus Jakarta Sans, trust-blue primary,
// orange CTA, glassmorphism surfaces, SVG icons only, 44px targets,
// AA contrast in both themes.

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

export default function Home() {
  return (
    <div className="hero-mesh">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:py-16">
        <section className="text-center">
          <p className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-fg shadow-sm">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            224,000+ verified businesses live — UAE · Nepal · US cities loading now
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight text-fg sm:text-5xl lg:text-6xl">
            Find <span className="bg-gradient-to-r from-accent to-cta bg-clip-text text-transparent">real business leads</span>, anywhere.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted sm:text-lg">
            Search real companies by industry and city, get the contacts they publish — phone, email, website, socials — scored by AI and ready to export. Free to start, unlimited* on Pro.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-cta">Start free — no card needed</Link>
            <Link href="/dashboard" className="btn-ghost">Open the dashboard</Link>
          </div>
          <p className="mt-3 text-xs text-muted">Free: 30 leads/day · Pro: unlimited* leads (fair use)</p>

          <dl className="glass mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-y-6 rounded-[calc(var(--radius)+8px)] px-6 py-6 shadow-[var(--shadow)] lg:grid-cols-4" aria-label="Platform numbers">
            {stats.map(([n, label]) => (
              <div key={label} className="px-2">
                <dt className="order-2 mt-1 block text-xs font-medium text-muted">{label}</dt>
                <dd className="text-2xl font-extrabold text-fg sm:text-3xl">{n}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Features">
          {features.map((f) => (
            <div key={f.title} className="card card-hover p-6">
              <span className="inline-flex rounded-xl p-2.5 text-accent-text" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }} aria-hidden="true">{f.icon}</span>
              <h2 className="mt-4 font-semibold text-fg">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
            </div>
          ))}
        </section>

        <section className="mt-16" aria-label="How it works">
          <h2 className="text-center text-2xl font-bold text-fg sm:text-3xl">From search to conversation in minutes</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map(([t, d], i) => (
              <div key={t} className="card p-6">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold text-accent-fg" style={{ background: "var(--accent)" }} aria-hidden="true">{i + 1}</span>
                <h3 className="mt-4 font-semibold text-fg">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-16 grid max-w-3xl gap-4 md:grid-cols-2" aria-label="Pricing">
          <div className="card card-hover p-6">
            <h2 className="text-xl font-bold text-fg">Free</h2>
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
            <h2 className="text-xl font-bold text-fg">Pro</h2>
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
        </section>

        <p className="mx-auto mt-12 max-w-2xl text-center text-xs leading-relaxed text-muted">
          Leads are company-level prospects from public business data. Every lead shows its source so you can verify it before outreach. LeadsForceGen never sells personal phone numbers or personal emails, and never scrapes social media or Google.
        </p>
      </div>
    </div>
  );
}
