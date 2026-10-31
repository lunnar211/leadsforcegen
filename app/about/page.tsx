import Link from "next/link";

export const metadata = { title: "About" };

export default function About() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-muted">
      <h1 className="text-2xl font-bold text-fg">About LeadsForceGen</h1>
      <div className="mt-6 space-y-4 text-sm leading-6">
        <p>
          LeadsForceGen is an AI lead generation tool that finds verified B2B
          leads by industry and city — dentists, restaurants, hotels, clinics,
          schools, agencies and hundreds more categories. Search, score and
          export real businesses, then reach out with AI-generated outreach
          messages.
        </p>
        <p>
          <strong className="text-fg">Real business data.</strong> Leads come
          from a stored database of over 1.1 million businesses, built on
          Overture Maps, OpenStreetMap and the public websites of the
          businesses themselves. Every lead shows its source so you can verify
          it before outreach. LeadsForceGen never sells personal phone numbers
          or personal emails, and never scrapes social media or Google.
        </p>
        <p>
          <strong className="text-fg">Who it is for.</strong> Sales teams,
          agencies, freelancers and founders who need a steady pipeline of
          real prospects — without buying stale lead lists or doing manual
          research for hours.
        </p>
        <p>
          <strong className="text-fg">Plans.</strong> Free: 30 leads per day.
          Pro: $19 per month, with up to 500 leads per search, Excel and CSV
          export, and full AI outreach (fair-use up to 100,000 leads per day,
          marketed as “Unlimited*”).
        </p>
        <p>
          Read the <Link className="font-semibold text-accent-text underline" href="/privacy">Privacy Policy</Link> and{" "}
          <Link className="font-semibold text-accent-text underline" href="/terms">Terms of Service</Link> for
          how data is handled and what the service may be used for. To get
          started, <Link className="font-semibold text-accent-text underline" href="/signup">create a free account</Link> or
          see <Link className="font-semibold text-accent-text underline" href="/pricing">pricing</Link>.
        </p>
      </div>
    </div>
  );
}
