# LeadsForceGen — n8n automations

Two import-ready workflows that keep the lead database fresh and make
website searches return complete leads instantly:

| Workflow file | Schedule | What it does |
|---|---|---|
| `search-cache-warmer.json` | Daily, 03:30 | Calls the website's secret-guarded `/api/internal/warm` route to pre-run the most common searches into the 6h results cache — the first customer of the day gets instant results. Needs `WARM_SECRET` in the n8n environment, matching the website's Vercel env var. |
| `lead-db-monthly-refresh.json` | 5th of month, 05:00 | **Superseded by the split files below — import one set, not both.** The original combined job: downloads the new Overture Maps release and upserts AE + NP + US metros straight into the Supabase `places` table (`scripts/refresh_places.py`), plus CITY-PACKS. Then sends a Telegram report. |
| `lead-db-refresh-ae.json` | 5th, 05:00 | UAE only (`refresh_places.py AE`). Split maintenance: one country's failure or slowness never blocks the others, and each report names its own region. |
| `lead-db-refresh-np.json` | 5th, 05:30 | Nepal only (`refresh_places.py NP`). |
| `lead-db-refresh-us.json` | 6th, 05:00 | US metros only (`refresh_places.py US-METROS`). |
| `lead-db-refresh-citypacks.json` | 6th, 05:30 | Worldwide city packs only (`refresh_places.py CITY-PACKS`): all 11 packs to warehouse files, only Karachi + Dhaka upserted to the hot window. |
| `lead-db-weekly-quality.json` | Sun, 02:00 | AI-assisted data quality (`scripts/verify_places.py --limit 5000`): website reachability, email MX, phone shape, name sanity, dedupe flagging, and a Groq review of suspicious name/category pairs. Confidence only ever goes DOWN; nothing is ever deleted — flagged rows sink to the bottom of results. Needs the `supabase/places-quality.sql` columns (`verified_at`, `quality_flags`) applied once, and `GROQ_API_KEY` in the n8n environment for the AI step (skipped without it). |
| `leads-generation.json` | On request (webhook) | The bridge: POST a niche + city → `scripts/generate_leads.py` pulls from the database (or the local dataset files) → writes ready-to-send Excel + CSV lead files to `out/` → Telegram report + webhook reply. |
| `nightly-email-enrichment.json` | Daily, 02:00 | Visits the OWN websites of businesses that have a website but no email, extracts emails they publish (mailto / schema.org JSON-LD), and fills them in (`scripts/enrich_emails.py`) — so searches come back with emails already attached, no live crawling wait. Then a Telegram report. |

Both write directly to Postgres. No dashboard CSV importer, ever again.

## Setup (one time, ~10 minutes)

1. **Run n8n** — either:
   - n8n Cloud (app.n8n.cloud, Dipesh's account), or
   - self-hosted: `npx n8n` / Docker on a machine that stays on.
2. **Copy this repo** to the n8n host at `/opt/leadsforcegen`
   (the Execute Command nodes `cd` there — edit the path in the nodes if
   you put it elsewhere). On the host: `pip install duckdb psycopg2-binary`.
3. **Set `DATABASE_URL`** in the environment of the n8n process:
   Supabase Dashboard → project LeadForge → Settings → Database →
   Connection string → copy the URI (it contains the database password;
   use "Reset database password" there if it's forgotten).
   **Never paste this value into chat, code, or git.**
4. **Import both workflow JSONs** (Workflows → Import from File).
5. **Create the Telegram credential** in n8n (Credentials → Telegram API):
   paste the @LeadsForceGenAdminBot token directly into n8n. The report
   nodes already target Dipesh's admin chat (7153926241).
6. **Activate** both workflows (toggle top-right).

## Why this makes the website faster

- Search results read the `places` table (indexed bbox query, ~ms). The
  slow part was always *filling gaps live* — blocked map mirrors and
  per-search website crawling.
- The nightly job pre-fills the biggest gap (missing emails) in bulk, off
  the request path; the monthly job keeps listings current as businesses
  open/close/move.
- Compliance is unchanged: only emails a business publishes on its own
  website are collected (same blocklist and no-guessing rules as the app).
