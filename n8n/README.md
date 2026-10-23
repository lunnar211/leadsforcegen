# LeadsForceGen — n8n automations

Two import-ready workflows that keep the lead database fresh and make
website searches return complete leads instantly:

| Workflow file | Schedule | What it does |
|---|---|---|
| `lead-db-monthly-refresh.json` | 5th of month, 05:00 | Downloads the new Overture Maps release and upserts AE + NP + US metros straight into the Supabase `places` table (`scripts/refresh_places.py`), then sends a Telegram report. |
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
