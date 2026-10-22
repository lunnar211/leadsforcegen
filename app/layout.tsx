import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
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
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-[100dvh] flex flex-col bg-bg text-fg font-sans antialiased">
        <Nav />
        <main className="flex-1 w-full">{children}</main>
        <footer className="border-t border-border py-6 safe-b text-center text-xs text-muted">
          <p>LeadsForceGen — AI-generated prospects must be verified before outreach.</p>
          <nav className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-2 px-4" aria-label="Legal">
            <a className="underline hover:text-fg" href="/privacy">Privacy</a>
            <a className="underline hover:text-fg" href="/terms">Terms</a>
            <a className="underline hover:text-fg" href="/unsubscribe">Unsubscribe / remove a business</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
