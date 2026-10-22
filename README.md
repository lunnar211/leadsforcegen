# LeadsForceGen

AI-powered lead generation SaaS. Search company-level prospects for any niche, score them with AI, and generate outreach.

- **Free plan:** 10 leads/day, AI scoring, search history (no CSV export)
- **Pro plan:** unlimited leads, CSV export, full AI outreach — $19/mo (₹1,499 via Razorpay)
- **Stack (all free tiers):** Next.js (App Router, TypeScript) + Tailwind, Supabase (auth + database), Groq AI, Vercel hosting, Razorpay / Stripe payments
- **Admin panel** at `/admin` for the owner: users, plans, activity, subscriptions

> Leads are company/business prospects suggested by AI. They must be **verified before outreach**. LeadsForceGen never invents personal phone numbers or personal email addresses.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in your own values — never commit this file
npm run dev                  # http://localhost:3000
```

Then run `supabase/schema.sql` in your Supabase project (Dashboard → SQL Editor) to create the tables (`profiles`, `leads`, `searches`, `activity_log`, `subscriptions`, `payments`, `webhook_events`).

Without any env vars the app still runs in a clearly-labeled demo mode: AI routes fall back to sample company data, auth shows a demo notice, and checkout explains that no gateway is configured.

## Environment variables

Set these by **name** in `.env.local` locally and in the Vercel dashboard when deploying. Never put real secret values in code, this README, or git.

| Name | Used for |
|---|---|
| `AI_PROVIDER`, `AI_MODEL` | AI provider/model selection (Groq) |
| `GROQ_API_KEY` | Groq AI (lead generation + outreach) — server only |
| `GEMINI_API_KEY` | Optional alternate AI provider — server only |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client + auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase writes (payments, plan upgrades) |
| `NEXT_PUBLIC_SITE_URL` | Public site URL (your Vercel URL in production) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Razorpay checkout + verification |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_ID_PRO` | Stripe Checkout + verification |

## Payments — how they work (secure + duplicate-proof)

Gateways are optional and env-configured; either or both can be enabled.

1. **Server-side prices only.** Prices live in the server plan map (`lib/payments/plans.ts`) and, for Stripe, in the Stripe Price (`STRIPE_PRICE_ID_PRO`). The browser never sends an amount that is trusted.
2. **Create:** the Pro button on `/checkout` calls `POST /api/payments/create-order`, which creates a Razorpay order or a Stripe Checkout session server-side for the server-side amount.
3. **Verify (server only):**
   - Razorpay: `/api/payments/verify` checks the HMAC-SHA256 signature, re-fetches the payment from Razorpay, and requires `status = captured` **and** amount + currency matching the plan map.
   - Stripe: `/api/payments/webhook` verifies the webhook signature (HMAC over `timestamp.payload`, 5-minute tolerance) and requires a paid checkout session for the Pro plan.
   - A browser/client success callback **alone never upgrades a plan**.
4. **Duplicate / hack protection (idempotency):**
   - `payments` table has `UNIQUE(gateway_payment_id)` and `UNIQUE(gateway_order_id)`; `webhook_events` has `UNIQUE(gateway, gateway_event_id)`.
   - Verify/webhook handlers check for an existing payment/event ID first and skip if already processed (inserts use on-conflict-do-nothing). Replayed webhooks, double clicks, and retried verifications cannot double-record a payment or double-upgrade a user.
5. **Webhooks:** point Razorpay/Stripe webhook URLs to `https://<your-site>/api/payments/webhook` and set the matching webhook secret env var.

## Deploy

### 1. GitHub
```bash
git init        # already initialized in this repo
git add . && git commit -m "LeadsForceGen MVP"
# Create an empty repo on github.com (no README), then:
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```
`.gitignore` ignores `.env` and `.env*.local` (real secrets) but keeps `.env.example`.

### 2. Vercel
1. Log in to Vercel → **Add New → Project** → import the GitHub repo above.
2. Framework preset: Next.js (auto-detected). Build command: `npm run build`.
3. In **Project Settings → Environment Variables**, add every variable from `.env.example` with your own values.
4. Set `NEXT_PUBLIC_SITE_URL` to your Vercel deployment URL (e.g. `https://<project>.vercel.app`).
5. Deploy. Re-run `supabase/schema.sql` first if you have not, and update the Razorpay/Stripe webhook URLs to the production domain.

## Pages & API routes

| Route | What it does |
|---|---|
| `/` | Landing: hero, features, Free vs Pro pricing |
| `/login`, `/signup` | Supabase Auth (demo-mode notice when not configured) |
| `/dashboard` | Lead search, free-limit enforcement, AI scores, Pro CSV export, AI outreach, search history |
| `/checkout` | Pro checkout via Razorpay / Stripe |
| `/admin` | Owner panel: stats, users (plan / active toggles), activity log, subscriptions |
| `POST /api/ai/leads` | AI company prospects via Groq; labeled sample fallback |
| `POST /api/ai/outreach` | AI outreach message for a lead; template fallback |
| `POST /api/payments/create-order` | Server-side order/session creation |
| `POST /api/payments/verify` | Server-side Razorpay verification |
| `POST /api/payments/webhook` | Razorpay + Stripe webhooks with dedupe |

## Google login (Supabase Auth)

The login and signup pages include a "Continue with Google" button that uses
Supabase Auth OAuth (PKCE) and returns to `/auth/callback`. To enable it:

1. In Google Cloud Console, create an OAuth 2.0 Client ID (Web application).
2. Add Supabase's callback URL as an authorized redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. In the Supabase dashboard: Authentication > Providers > Google — enable it
   and paste the Google Client ID and Client Secret.
4. In Supabase: Authentication > URL Configuration — add your site URL and
   `https://<your-site>/auth/callback` to the redirect allow list.
