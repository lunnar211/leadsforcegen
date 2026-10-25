# LeadsForceGen — data maintenance chain (ops doc)

One document for the whole data pipeline. If a step below disagrees with
an older note somewhere else, this file wins — update it when the chain
changes.

## Architecture in one paragraph

**Files are the warehouse, free Supabase is the hot window.** Master
datasets live as CSV files in the Google Drive folder "LeadsForceGen
Data" (private, owner-only). The free Supabase project "LeadForge"
holds the hot `places` table (~1.1M rows: UAE, Nepal, NYC + Seattle,
Karachi, Dhaka) that live search reads in milliseconds. A second free
Supabase project "LeadForge-Packs" holds the London + Toronto city
packs. Nothing else is a source of truth.

## The chain, end to end

```
Overture Maps Places (public S3 parquet, CDLA-Permissive — storing allowed)
  │  scripts/ingest_overture.py            one-off warehouse CSVs (AE, NP, …)
  │  scripts/ingest_overture_city.py       city packs, any city on Earth
  │    --counts                             size packs against DB headroom
  │    --per-part                           timeout-proof extract w/ .done resume
  ▼
data/places-*.csv / data/places-city-*.csv  warehouse files (gitignored)
  │  → uploaded to Drive "LeadsForceGen Data" (manual, after a refresh)
  │
  │  scripts/refresh_places.py             monthly live-table refresh
  │    AE | NP                             whole-country upsert
  │    US-METROS                           10 metros → warehouse files,
  │                                        upsert ONLY NYC + Seattle (hot window)
  │    CITY-PACKS                          11 packs → warehouse files,
  │                                        upsert ONLY Karachi + Dhaka
  ▼
Supabase "LeadForge" public.places        hot window (~1.1M rows, ~474/500 MB)
  │  engine: lib/engine/placesDb.ts        bbox + category query, ~ms
  ▼
Live search (app/api/ai/leads)            stored rows first, OSM legs fill gaps
```

### City packs and the second project

- Pack boxes live in ONE place: `scripts/ingest_overture_city.py`
  `CITIES` (centre + radius_km). `scripts/refresh_places.py` imports
  that dict, and `scripts/generate_leads.py` derives its city boxes from
  it — never copy the boxes into a second list again.
- The 9 extracted packs (London, Toronto, Mumbai, Delhi, Sydney, Berlin,
  Paris, Tokyo, São Paulo) total ~3.59M rows as warehouse files.
- "LeadForge-Packs" uses the SAME table definition as main:
  `supabase/places.sql` + `supabase/places-quality.sql`, applied to that
  project. Its rows arrive by **manual CSV import through the Supabase
  dashboard** — no script or workflow upserts into it yet. The engine
  fan-out (`queryPlaces`, env-gated on `SUPABASE_PACKS_*`) reads it once
  those env vars land in Vercel Production + redeploy.
- London cannot move into the main hot table: ~725k rows ≈ 474 MB of
  headroom math leaves ~26 MB free. Packs stay in their own project.

### Nightly + weekly jobs (n8n, on the n8n host)

| Job | Schedule | Script | What it does |
|---|---|---|---|
| Refresh AE | 5th, 05:00 | `refresh_places.py AE` | UAE upsert |
| Refresh NP | 5th, 05:30 | `refresh_places.py NP` | Nepal upsert |
| Refresh US metros | 6th, 05:00 | `refresh_places.py US-METROS` | 10 metros → files, 2 upserted |
| Refresh city packs | 6th, 05:30 | `refresh_places.py CITY-PACKS` | 11 packs → files, 2 upserted |
| Weekly data quality | Sun, 02:00 | `verify_places.py --limit 5000` | Reachability, MX, phone shape, name sanity, dedupe, Groq review |
| Nightly email enrichment | Daily, 02:00 | `enrich_emails.py 300` | Fills emails from businesses' OWN pages |
| Search cache warmer | Daily, 03:30 | `GET /api/internal/warm` | Pre-runs common searches into the 6h cache |
| Leads generation (webhook) | On request | `generate_leads.py` | DB/CSV → Excel + CSV in `out/` + Telegram report |

All workflows live in `n8n/`; per-workflow setup is in `n8n/README.md`.
The combined `lead-db-monthly-refresh.json` is SUPERSEDED by the four
split refresh workflows — import one set, not both.

### Weekly quality job — safety rules (hard)

`scripts/verify_places.py` needs the `supabase/places-quality.sql`
columns (`verified_at`, `quality_flags`) applied once. Its rules:

- Confidence only ever goes DOWN. Verification never inflates a row.
- Nothing is ever deleted. Bad rows are flagged and sunk to confidence
  0.05, so a wrong flag costs ranking, not data.
- AI (Groq) may ONLY flag clear name/category mismatches. It never
  recategorises, edits, or deletes. AI failure skips the AI step only.

### Compliance rules every script follows

Public business data only. No LinkedIn/Facebook/Instagram/X/TikTok/
Telegram/WhatsApp/Google Maps/Search HTML, no login-gated or paywalled
pages, no leaked data, no private individuals' data, no guessed or
pattern-invented emails/phones. Emails come only from a business's own
published pages (mailto / JSON-LD). Social-platform URLs are moved out
of the website field into `socials`.

## Dead / superseded code (kept, not deleted)

| File | Status | Why |
|---|---|---|
| `scripts/discover_cse.py` | DEPRECATED | Google CSE "Search the entire web" is off and cannot be turned back on; the engine CSE leg contributes zero leads. Header-marked, not deleted. |
| `scripts/ingest_overture_city_per_part.py` | SUPERSEDED, untracked | `ingest_overture_city.py --per-part` does the same job with `.done` resume markers + concatenation; the standalone script has no markers. Left untracked; the owner may delete it. |
| `n8n/lead-db-monthly-refresh.json` | SUPERSEDED | Replaced by the four split refresh workflows (one region's failure never blocks the others). Name-marked in the n8n UI. |
| `lib/engine/cse.ts` (app code) | Dormant, env-gated | Still in the app but contributes zero leads while CSE entire-web stays off. Left untouched by the data audit; removing it is an app decision. |

## Known duplication, intentionally left alone

The DuckDB extract logic appears in three scripts (`ingest_overture.py`,
`ingest_overture_city.py`, `refresh_places.py`) with subtle differences
(SQL-side vs Python-side social cleaning, closed-status filter wording).
Merging them into one function risks breaking the proven monthly
refresh, so they stay separate with a shared-rules note. What WAS
deduplicated in the 2026-10-25 audit: city-pack boxes (single source in
`ingest_overture_city.py`) and the `generate_leads.py` city list (now
derived from the packs + its 4 local cities).

## Owner steps (needs the owner's hands — nothing here is automated)

1. **n8n home**: run n8n on Cloud or an always-on machine; copy this
   repo to `/opt/leadsforcegen` on that host; `pip install duckdb
   psycopg2-binary` there.
2. **Database password**: in the n8n process environment, set
   `DATABASE_URL` from Supabase Dashboard → project LeadForge →
   Settings → Database → Connection string. Type it into n8n directly
   — never paste it into chat, code, or git.
3. **Telegram credential**: create the Telegram API credential in n8n
   with the @LeadsForceGenAdminBot token (paste directly into n8n).
   Report nodes already target the admin chat.
4. **Quality-job AI key**: set `GROQ_API_KEY` in the n8n environment
   for the AI review step (skipped without it — the deterministic
   checks still run).
5. **Cache warmer secret**: set `WARM_SECRET` in the n8n environment,
   matching the website's Vercel env var.
6. **Packs project env**: set `SUPABASE_PACKS_URL`,
   `SUPABASE_PACKS_ANON_KEY`, `SUPABASE_PACKS_SERVICE_ROLE_KEY` in
   Vercel Production (from the LeadForge-Packs project's API Keys page),
   then redeploy — this wakes the engine fan-out for London/Toronto.
7. **Packs CSV import** (until automated): import
   `data/places-city-london-part-*.csv` and
   `data/places-city-toronto.csv` into the packs project via the
   Supabase dashboard, and SQL-verify the row counts afterwards.
8. **After any refresh**: copy new warehouse files from the n8n host
   into the Drive "LeadsForceGen Data" folder (no auto-upload exists).

## Verification performed (2026-10-25 audit)

- `python -m py_compile` on every script touched: PASS.
- JSON-parse on every n8n workflow touched: PASS (all 9 workflows in
  `n8n/` also parse; the three single-line files are minified JSON, not
  empty).
- App does not import any script (only code comments mention script
  names): no `npm run build` needed, none run.
- Runtime checks: `refresh_places.CITY_PACKS` imports from
  `ingest_overture_city` correctly; `generate_leads --city london` and
  `--city "sao paulo"` now resolve boxes; `dubai` box unchanged.
