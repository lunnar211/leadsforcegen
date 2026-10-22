import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "LeadsForceGen — Find leads with AI",
  description: "Generate AI-scored B2B company leads. Free plan with limits, Pro for unlimited leads, CSV export and AI outreach.",
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
