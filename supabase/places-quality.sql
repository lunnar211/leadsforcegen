-- LeadsForceGen: data-quality columns for the `places` table.
-- Additive only — safe to run on the live table, no rows are modified.
-- Used by scripts/verify_places.py (weekly n8n job): verified_at tracks
-- the last verification pass, quality_flags records what failed
-- (bad_name, bad_phone, website_unreachable, email_no_mx,
-- duplicate_of:<id>, ai_category_mismatch, mx_unchecked).
-- Nothing is ever deleted on a flag; confidence penalties push bad rows
-- to the bottom of results instead.
alter table public.places add column if not exists verified_at timestamptz;
alter table public.places add column if not exists quality_flags jsonb not null default '[]'::jsonb;
create index if not exists idx_places_verified_at on public.places (verified_at nulls first);
