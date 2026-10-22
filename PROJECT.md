# LeadForge (LeadsForceGen) — Project Brief

B2B lead generation SaaS. A user types a goal ("dentists in Dubai with email");
the app searches many PUBLIC sources, reads business websites, and returns
scored leads with a source link for every field.

- Live: https://leadsforcegen.vercel.app · Repo: github.com/lunnar211/leadsforcegen
- Stack: Next.js 16 (App Router, Cache Components), TypeScript, Tailwind,
  Supabase (auth + Postgres + RLS), Groq AI (provider-switchable), Vercel.
- Plans: Free 30 leads/day · Pro fair-use 2,000/day shown as "Unlimited*".
- Payments (per owner decision F2): Lemon Squeezy + manual eSewa/Khalti/bank
  with admin-approved proof uploads. No Stripe. Price/plan never from client.
- Admin: /admin locked to the owner (server-verified email + password gate
  now; role-based checks on every admin page/API as F3 lands).

## Compliance rules (non-negotiable)
- Public business data only. Never fetch/scrape LinkedIn, Facebook,
  Instagram, X/Twitter, TikTok, Telegram, WhatsApp, Google Maps/Search HTML,
  or any login-gated/paywalled page (lib/sources/policy.ts, enforced in
  lib/safe-fetch.ts).
- Never use leaked/breached/stolen data; uploads that look like breach dumps
  are rejected with a reason. No personal data of private individuals.
- Respect robots.txt, 1 req/sec/host, honest bot User-Agent.
- Never guess or pattern-invent emails/phones. Every field carries
  provenance: source_url, source_id, found_at.
- Outreach always includes an opt-out line; /unsubscribe removes a business
  from all future results. No bulk email sending feature.
- Users must follow GDPR, CAN-SPAM and local law (stated in Terms/landing).

## Working rules
- One task at a time (see TASKS.md). lint + build + a real test with raw
  output before any task is marked DONE. No fake data anywhere.
- Secrets: env NAMES only, never values, in code, chat, logs or commits.
- Working directory on this machine: ~/workspace/leadgen-app
  (the owner's local path is /home/dipesh/Desktop/leadsgen).
