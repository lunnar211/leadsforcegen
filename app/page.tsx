import Link from "next/link";

const features = [
  ["🎯 Any lead type", "Search by industry, location, company size and keywords — restaurants, SaaS, clinics, agencies, e-commerce and more."],
  ["🤖 AI scoring", "Every company prospect gets an AI fit score so you work the best leads first."],
  ["✉️ AI outreach", "Generate a personalized outreach message for any lead in one click."],
  ["📥 CSV export (Pro)", "Export unlimited leads to CSV for your CRM or outreach tool."],
  ["🛠️ Admin control", "Owner admin panel: users, plans, activity and subscriptions in one place."],
  ["🔒 Secure payments", "Pro checkout via Lemon Squeezy, Razorpay or Stripe, verified on the server with duplicate-payment protection."],
];

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 sm:py-14">
      <section className="text-center">
        <h1 className="text-4xl font-extrabold leading-tight text-fg sm:text-5xl lg:text-6xl">
          LeadsForceGen<br />Get leads for anything. Powered by AI.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted">
          Search company-level prospects for any niche, score them with AI, and generate outreach — free to start, unlimited* on Pro.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/signup" className="btn-primary">Get started free</Link>
          <Link href="/dashboard" className="btn-ghost">Open dashboard</Link>
        </div>
        <p className="mt-3 text-xs text-muted">Free: 30 leads/day · No credit card required · *fair-use 2,000/day</p>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Features">
        {features.map(([t, d]) => (
          <div key={t} className="card p-5">
            <h2 className="font-semibold text-fg">{t}</h2>
            <p className="mt-2 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-14 grid max-w-3xl gap-4 md:grid-cols-2" aria-label="Pricing">
        <div className="card p-6">
          <h2 className="text-xl font-bold text-fg">Free</h2>
          <p className="mt-2 text-3xl font-extrabold text-fg">$0</p>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            <li>✓ 30 leads per day</li><li>✓ AI lead scoring</li><li>✓ Search history</li><li>✗ No CSV export</li><li>✗ Limited AI outreach</li>
          </ul>
          <Link href="/signup" className="btn-ghost btn-block mt-6">Start free</Link>
        </div>
        <div className="card p-6" style={{ borderColor: "var(--accent)", borderWidth: 2 }}>
          <h2 className="text-xl font-bold text-fg">Pro</h2>
          <p className="mt-2 text-3xl font-extrabold text-fg">$19<span className="text-base font-medium text-muted">/mo</span></p>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            <li>✓ Unlimited* leads (fair-use 2,000/day)</li><li>✓ CSV export</li><li>✓ Full AI outreach generator</li><li>✓ Priority AI model</li><li>✓ Secure worldwide checkout</li>
          </ul>
          <Link href="/checkout" className="btn-primary btn-block mt-6">Upgrade to Pro</Link>
        </div>
      </section>

      <p className="mt-10 text-center text-xs text-muted">
        Leads are company-level prospects from public sources. Always verify a business before outreach. LeadsForceGen does not provide personal phone numbers or personal emails.
      </p>
    </div>
  );
}
