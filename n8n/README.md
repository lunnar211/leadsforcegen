# LeadsForceGen — n8n automations

Nine import-ready workflows: four split monthly refreshes, a weekly
quality job, nightly email enrichment, a search-cache warmer, and the
leads-generation webhook — plus one superseded combined refresh (import
one refresh set, not both). Files are the warehouse, free Supabase is
the hot window; the canonical ops doc is `docs/data-maintenance.md`.

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

The refresh, quality, and enrichment workflows write to Postgres (the
hot window); the leads-generation webhook writes Excel + CSV files to
`out/`; the warmer only pre-runs searches into cache. The packs project
is the exception — its rows still arrive by manual dashboard CSV import.
See `docs/data-maintenance.md`, the canonical ops doc.

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
4. **Import the workflow JSONs you want** (Workflows → Import from File).
   Import ONE set for monthly refresh, not both: either the split files
   (`lead-db-refresh-ae/np/us/citypacks.json`, recommended) OR the
   combined `lead-db-monthly-refresh.json` (superseded — its name says so
   in the n8n UI). Importing both would run the same refresh twice.
5. **Create the Telegram credential** in n8n (Credentials → Telegram API):
   paste the @LeadsForceGenAdminBot token directly into n8n. The report
   nodes already target Dipesh's admin chat (7153926241).
6. **Activate** the workflows you imported (toggle top-right).

## Notes the operator must know

- **Leads-generation webhook input is sanitised, not trusted.** The
  `leads-generation.json` workflow runs a "Sanitize input" step before
  any shell command: niche/city are stripped to letters, digits, spaces,
  hyphens and underscores (max 50 chars), limit is clamped to 1–5000.
  Raw webhook bodies never reach a shell. Still, treat the webhook URL
  as private — n8n's webhook node carries no authentication in this
  export, so do not publish the URL, and enable n8n webhook auth if the
  URL ever has to be shared.
- **The packs project is not refreshed by these workflows.** The second
  free Supabase project (LeadForge-Packs, London + Toronto) uses the
  same table definition (`supabase/places.sql` + `supabase/places-quality.sql`
  applied to that project), but its rows arrive by manual CSV import
  through the Supabase dashboard — no workflow upserts into it yet.
  `refresh_places.py CITY-PACKS` refreshes the 11 warehouse files and
  upserts only Karachi + Dhaka into the MAIN hot table.
- **US-METROS cannot fill the hot table.** `refresh_places.py US-METROS`
  extracts all 10 metros to warehouse files but upserts only NYC +
  Seattle (the metros actually in the hot window). Upserting all 10
  (~3.6M rows) would overflow the 500 MB free tier.
- **Full chain map:** see `docs/data-maintenance.md` — Drive warehouse →
  scripts → hot table → packs project → n8n schedules → weekly quality
  job → live search, plus the owner-steps checklist.

## Why this makes the website faster

- Search results read the `places` table (indexed bbox query, ~ms). The
  slow part was always *filling gaps live* — blocked map mirrors and
  per-search website crawling.
- The nightly job pre-fills the biggest gap (missing emails) in bulk, off
  the request path; the monthly job keeps listings current as businesses
  open/close/move.
- Compliance is unchanged: only emails a business publishes on its own
  website are collected (same blocklist and no-guessing rules as the app).
