-- Security-fixes migration (2026-10-24 sweep). Idempotent: safe to run
-- on the live database even if parts already exist. Run in the Supabase
-- SQL Editor, then verify with the checks at the bottom.
--
-- 1. P1: duplicate-proof guard — SHA-256 of the uploaded proof file.
alter table if exists payments add column if not exists proof_hash text;
create index if not exists idx_payments_proof_hash on payments (user_id, proof_hash, status);

-- 2. Admin lockout that actually engages on serverless (Supabase-backed
-- counters shared across instances; the old Upstash/memory counters
-- never tripped in production).
create table if not exists admin_login_failures (
  key text primary key,
  failures int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table admin_login_failures enable row level security;

-- 3. Quality-job columns (from the 2026-10-24 split-maintenance commit;
-- harmless to include here so one SQL session activates everything).
alter table if exists places add column if not exists verified_at timestamptz;
alter table if exists places add column if not exists quality_flags jsonb default '[]';
create index if not exists idx_places_verified_at on places (verified_at nulls first);

-- Verification (expect: proof_hash col = 1, failures table = 1):
-- select count(*) as proof_hash_col from information_schema.columns
--   where table_name = 'payments' and column_name = 'proof_hash';
-- select count(*) as failures_table from information_schema.tables
--   where table_name = 'admin_login_failures';
