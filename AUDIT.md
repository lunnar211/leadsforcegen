# AUDIT — LeadsForceGen (2026-10-22)

Method: full grep sweep of app/, components/, lib/, supabase/; manual review
of auth, payments, AI routes, config; live-site checks. Severity per item.

## 1. Security
- **Critical** — none found. No secrets in tracked code (pattern scan clean;
  `.env.example` values all empty; `.env*` gitignored).
- **High** — `app/api/ai/leads`, `app/api/ai/outreach`: no auth and no rate
  limit. Once a Groq key is set, anyone can burn AI quota/cost anonymously.
- **High** — Client-side plan/quota in `app/dashboard/page.tsx`
  (localStorage `leadsforcegen_plan` / usage count): trivially bypassed.
  Real fix = server quota (TASKS F1/C6, needs Supabase live).
- **Medium** — `next.config.ts`: no security headers (CSP, frame, nosniff,
  referrer, HSTS).
- **Medium** — `/admin` gate is strong (server-verified signed cookie,
  rate-limited login) but `ADMIN_PASSWORD` is unset in Vercel → owner is
  locked out until he sets it (manual action, dashboard only).
- **Low** — Payments scaffold covers Razorpay/Stripe while the master plan
  (F2) specifies Lemon Squeezy + manual eSewa/Khalti; webhook verification
  code is correct for the scaffolded gateways. Decide before launch.
- **Low** — `lib/payments/store.ts` uses an in-memory store in demo mode;
  documented in-file; replaced by Supabase when configured.

## 2. Functionality
- **High** — Backend runs in demo mode: Supabase + AI keys unset in Vercel,
  so leads are labeled samples and admin shows sample data. Manual action:
  add env vars, run `supabase/schema.sql`.
- **High** — Missing legal/compliance pages required by the product rules:
  `/privacy`, `/terms`, `/unsubscribe` (+ API) did not exist.
- **Medium** — No custom 404 or error boundary (default Next pages).
- **Medium** — `/checkout` is reachable while no payment gateway is
  configured; it must keep failing closed (it does — server price map and
  "gateway not configured" errors), but the page should say so plainly.
- **Low** — Signup/login show demo notices when Supabase is unset (honest),
  Google button hidden unless configured (correct behavior).

## 3. Responsive design
- **Low** — No fixed-pixel width breakages found (grep for w-[≥300px] /
  min-w: none). Layout uses max-w containers + grid breakpoints; admin
  table scrolls horizontally on mobile (overflow-x-auto) — acceptable.
  Full device pass belongs to A2/G1 with Playwright screenshots.

## 4. Performance
- **Low** — No `<img>` tags (no unoptimized images); 5 unused scaffold SVGs
  in `public/` (next/vercel/file/globe/window) — dead weight, keep or remove
  at design pass (G1). No lazy-loaded heavy components yet.

## 5. SEO
- **Done** — title template, description, keywords, canonical, OG/Twitter,
  robots.txt, sitemap.xml (deployed 2026-10-22).
- **Medium** — No OG image asset (cards render without a picture).
- **Low** — Single H1 per page verified on landing; inner pages use H1s.

## 6. Accessibility
- **Medium** — Form inputs across login/signup/dashboard/admin rely on
  placeholders; zero `<label>` elements in the codebase. Screen-reader
  labels needed (aria-label pass done in this fix round for admin login;
  full label pass in B2).

## 7. Code quality
- **Done** — lint clean, `tsc --noEmit` clean, zero `console.log`.
- **Medium** — `.env.example` missing the Search-Everywhere source keys
  (Brave, Serper, CSE, SearXNG, Foursquare, Yelp, OpenCorporates,
  Companies House, CONTACT_EMAIL). Fixed in this round.
- **Low** — Duplicated demo-notice strings across pages; consolidate at B2.

## 8. Deployment readiness
- **Done** — production build clean; site live; env vars documented.
- **High** — GitHub is behind local commits (device-flow auth expired);
  Vercel deploys currently go through direct file upload. Reconnect git
  push when the owner next approves a device code.
- **Medium** — No `/api/health` endpoint (TASKS A7).

## Fix round applied with this audit
Security headers; per-IP rate limiting on AI routes; custom 404 + error
boundary; /privacy, /terms, /unsubscribe pages + /api/unsubscribe (Supabase
blocklist table added to schema); footer legal links; aria-labels on the
admin login; .env.example completed with all source key names.
