"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// A 404 that does a job: point the visitor at the lead search and the
// pages people actually want, instead of a dead end.
export default function NotFound() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:py-20">
      <p className="font-mono text-5xl font-bold text-fg">404</p>
      <h1 className="mt-3 font-display text-2xl font-bold text-fg">Page not found</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        The page you are looking for does not exist or has moved. The lead search lives on the dashboard — try it from there.
      </p>

      <form
        className="mt-6 flex gap-2"
        role="search"
        aria-label="Find your way"
        onSubmit={(e) => {
          e.preventDefault();
          router.push("/dashboard");
        }}
      >
        <label htmlFor="notfound-q" className="sr-only">What were you looking for?</label>
        <input
          id="notfound-q"
          className="input flex-1"
          placeholder="e.g. dentists in Dubai"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="btn-primary shrink-0">Search leads</button>
      </form>
      <p className="mt-2 text-xs text-muted">Lead search runs on the dashboard — sign in (free) and your search starts there.</p>

      <h2 className="mt-10 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted">Popular pages</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {[
          ["/dashboard", "Dashboard — search leads"],
          ["/pricing", "Pricing — Free vs Pro"],
          ["/blog", "Blog — guides"],
          ["/faq", "FAQ — how it works"],
          ["/#cities", "Covered cities"],
          ["/contact", "Contact"],
        ].map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="card block px-4 py-3 text-sm font-semibold text-fg hover:border-input-border">
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-center text-sm">
        <Link href="/" className="font-semibold text-accent-text underline underline-offset-2">← Back to home</Link>
      </p>
    </div>
  );
}
