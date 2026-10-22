import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://leadsforcegen.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LeadsForceGen — AI Lead Generation Tool | Find B2B Leads Fast",
    template: "%s | LeadsForceGen",
  },
  description:
    "LeadsForceGen is an AI lead generation tool that finds and scores B2B company leads by industry, location and company size. Start free with limited leads, upgrade to Pro for unlimited leads, CSV export and AI outreach messages.",
  keywords: [
    "lead generation tool",
    "AI lead generation",
    "B2B leads",
    "find business leads",
    "sales leads generator",
    "LeadsForceGen",
  ],
  applicationName: "LeadsForceGen",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "LeadsForceGen",
    title: "LeadsForceGen — AI Lead Generation Tool",
    description:
      "Find and score B2B company leads with AI. Free plan available — Pro gives unlimited leads, CSV export and AI outreach.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary",
    title: "LeadsForceGen — AI Lead Generation Tool",
    description:
      "Find and score B2B company leads with AI. Free plan available — Pro gives unlimited leads and AI outreach.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 antialiased">
        <Nav />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-500">
          LeadsForceGen — AI-generated prospects must be verified before outreach.
        </footer>
      </body>
    </html>
  );
}
