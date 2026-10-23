import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

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

// Runs before first paint: applies the saved theme (or the OS preference)
// so there is no flash or layout shift.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("lfg-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-[100dvh] flex flex-col bg-bg text-fg font-sans antialiased">
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
