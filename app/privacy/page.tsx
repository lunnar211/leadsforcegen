export const metadata = { title: "Privacy Policy" };

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-slate-300">
      <h1 className="text-2xl font-bold text-white">Privacy Policy</h1>
      <p className="mt-2 text-xs text-slate-500">Last updated: 2026-10-22</p>
      <div className="mt-6 space-y-4 text-sm leading-6">
        <p><strong className="text-white">What we collect about businesses.</strong> LeadsForceGen collects only publicly available business information — company name, business address, business phone, business email, website, and opening hours — from public sources such as business websites, OpenStreetMap and public registries. We do not collect personal data of private individuals, and we never use leaked, breached or stolen data.</p>
        <p><strong className="text-white">What we collect about users.</strong> Account email, plan and usage data needed to run the service, and payment records handled by our payment providers. Passwords are stored by our auth provider (Supabase), never in plain text on our side.</p>
        <p><strong className="text-white">How it is used.</strong> To provide lead search, scoring and exports to the account holder. We do not sell account data.</p>
        <p><strong className="text-white">Removal.</strong> Any business can be removed from all future results at any time via the <a className="underline" href="/unsubscribe">unsubscribe page</a>.</p>
        <p><strong className="text-white">Contact.</strong> The site owner can be reached at dipeshkarki8292@gmail.com for privacy questions and removal requests.</p>
      </div>
    </div>
  );
}
