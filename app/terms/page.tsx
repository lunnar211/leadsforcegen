export const metadata = { title: "Terms of Service" };

export default function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-muted">
      <h1 className="text-2xl font-bold text-fg">Terms of Service</h1>
      <p className="mt-2 text-xs text-muted">Last updated: 2026-10-22</p>
      <div className="mt-6 space-y-4 text-sm leading-6">
        <p><strong className="text-fg">The service.</strong> LeadsForceGen provides B2B lead discovery from public sources, with AI-assisted scoring. Lead data is provided “as is”; always verify a lead before outreach.</p>
        <p><strong className="text-fg">Your legal duties.</strong> You are responsible for complying with GDPR, CAN-SPAM, and the laws of every jurisdiction you contact. Every outreach message you send must identify you and include a working opt-out. You must honor opt-outs and removal requests promptly.</p>
        <p><strong className="text-fg">Acceptable use.</strong> No spam, no harassment, no resale of raw data dumps, no attempts to bypass plan limits or security controls, and no use of the service to collect data about private individuals.</p>
        <p><strong className="text-fg">Plans.</strong> Free: limited daily leads. Pro: fair-use up to 100,000 leads/day, marketed as “Unlimited*” subject to that fair-use limit. We may change plan limits with notice.</p>
        <p><strong className="text-fg">Removal.</strong> Businesses may remove themselves at any time via the <a className="underline" href="/unsubscribe">unsubscribe page</a>; users must respect the blocklist.</p>
      </div>
    </div>
  );
}
