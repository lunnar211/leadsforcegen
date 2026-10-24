import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import SiteBanner from "@/components/SiteBanner";

// Typography per the LeadsForceGen design system (UI/UX Pro Max):
// Plus Jakarta Sans — friendly, modern SaaS.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://leadsforcegen.vercel.app";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0f" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LeadsForceGen — AI Lead Generation Tool | Find B2B Leads",
    template: "%s | LeadsForceGen",
  },
  description:
    "Find verified B2B leads by industry and city — phone, email, website and social links included. Free: 30 leads a day. Pro: unlimited searches + exports.",
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
      "Find verified B2B leads by industry and city — phone, email, website and social links included. Free: 30 leads a day.",
    url: SITE_URL,
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "LeadsForceGen — verified B2B leads" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LeadsForceGen — AI Lead Generation Tool",
    description:
      "Find verified B2B leads by industry and city. Free: 30 leads a day. Pro: unlimited searches + exports.",
    images: ["/og.jpg"],
  },
};

// Structured data: helps search engines understand the product (and
// qualifies the site for rich results). Kept factual — no invented
// ratings, reviews, or social profiles.
const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "LeadsForceGen",
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  description:
    "AI lead generation tool that finds verified B2B business leads by industry and city from public listings and businesses' own websites.",
};
const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "LeadsForceGen",
  url: SITE_URL,
};

// Runs before first paint: applies the saved theme (or the OS preference)
// so there is no flash or layout shift.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("lfg-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }} />
      </head>
      <body className="min-h-[100dvh] flex flex-col bg-bg text-fg font-sans antialiased">
        <SiteBanner />
        <Nav />
        <main className="flex-1 w-full">{children}</main>
        <footer className="border-t border-border bg-surface safe-b">
          <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-bold text-fg">LeadsForceGen</p>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">Real business leads from public data — searched, scored and exported in minutes. Verify a business before outreach.</p>
            </div>
            <nav aria-label="Product">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Product</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><a className="text-muted hover:text-fg" href="/dashboard">Dashboard</a></li>
                <li><a className="text-muted hover:text-fg" href="/pricing">Pricing</a></li>
                <li><a className="text-muted hover:text-fg" href="/signup">Start free</a></li>
                <li><a className="text-muted hover:text-fg" href="/checkout">Go Pro — $19/mo</a></li>
              </ul>
            </nav>
            <nav aria-label="Legal">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Legal</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><a className="text-muted hover:text-fg" href="/privacy">Privacy</a></li>
                <li><a className="text-muted hover:text-fg" href="/terms">Terms</a></li>
                <li><a className="text-muted hover:text-fg" href="/unsubscribe">Remove a business</a></li>
              </ul>
            </nav>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Data</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">Built on Overture Maps, OpenStreetMap and the public websites of the businesses themselves. No social scraping, no personal data.</p>
            </div>
          </div>
          <div className="border-t border-border py-4 text-center text-xs text-muted">© 2026 LeadsForceGen. All rights reserved.</div>
        </footer>
      </body>
    </html>
  );
}
