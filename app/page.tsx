import Link from "next/link";

const features = [
  ["🎯 Any lead type", "Search by industry, location, company size and keywords — restaurants, SaaS, clinics, agencies, e-commerce and more."],
  ["🤖 AI scoring", "Every company prospect gets an AI fit score so you work the best leads first."],
  ["✉️ AI outreach", "Generate a personalized outreach message for any lead in one click."],
  ["📥 CSV export (Pro)", "Export unlimited leads to CSV for your CRM or outreach tool."],
  ["🛠️ Admin control", "Owner admin panel: users, plans, activity and subscriptions in one place."],
  ["🔒 Secure payments", "Pro checkout via Razorpay or Stripe, verified on the server with duplicate-payment protection."],
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <section className="text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold text-white">LeadsForceGen<br />Get leads for anything. Powered by AI.</h1>
        <p className="mt-4 text-slate-400 max-w-2xl mx-auto">Search company-level prospects for any niche, score them with AI, and generate outreach — free to start, unlimited on Pro.</p>
        <div className="mt-8 flex gap-3 justify-center">
          <Link href="/signup" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-semibold">Start free</Link>
          <Link href="/dashboard" className="border border-white/20 px-6 py-3 rounded-xl font-semibold hover:bg-white/5">Open dashboard</Link>
        </div>
        <p className="mt-3 text-xs text-slate-500">Free: 10 leads/day · No credit card required</p>
      </section>
      <section className="grid md:grid-cols-3 gap-4 mt-16">
        {features.map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h3 className="font-semibold text-white">{t}</h3>
            <p className="text-sm text-slate-400 mt-2">{d}</p>
          </div>
        ))}
      </section>
      <section className="grid md:grid-cols-2 gap-4 mt-16 max-w-3xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-xl font-bold text-white">Free</h3>
          <p className="text-3xl font-extrabold text-white mt-2">$0</p>
          <ul className="text-sm text-slate-300 mt-4 space-y-2">
            <li>✓ 10 leads per day</li><li>✓ AI lead scoring</li><li>✓ Search history</li><li>✗ No CSV export</li><li>✗ Limited AI outreach</li>
          </ul>
          <Link href="/signup" className="block text-center mt-6 border border-white/20 rounded-xl py-2.5 font-semibold">Start free</Link>
        </div>
        <div className="rounded-2xl border-2 border-indigo-500 bg-indigo-600/10 p-6">
          <h3 className="text-xl font-bold text-white">Pro</h3>
          <p className="text-3xl font-extrabold text-white mt-2">$19<span className="text-base text-slate-400">/mo</span></p>
          <ul className="text-sm text-slate-200 mt-4 space-y-2">
            <li>✓ Unlimited leads</li><li>✓ CSV export</li><li>✓ Full AI outreach generator</li><li>✓ Priority AI model</li><li>✓ Secure checkout (Razorpay / Stripe)</li>
          </ul>
          <Link href="/checkout" className="block text-center mt-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 font-semibold">Go Pro — secure checkout</Link>
        </div>
      </section>
      <p className="text-center text-xs text-slate-500 mt-10">Leads are company-level prospects suggested by AI. Always verify a business before outreach. LeadsForceGen does not provide personal phone numbers or personal emails.</p>
    </div>
  );
}
