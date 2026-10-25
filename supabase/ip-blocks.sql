-- Fake/bot IP protection (2026-10-25). Idempotent: safe to run in the
-- Supabase SQL Editor even if parts already exist, and safe to re-run.
--
-- THE OWNER APPLIES THIS FILE HIMSELF. No agent writes to live Supabase.
-- Until this file is applied, the app code FAILS OPEN: the block check
-- treats a missing table (or any DB error) as "not blocked", so every
-- route works exactly as before. Applying this file is what arms the
-- blocking; nothing else needs to change in Vercel.
--
-- DESIGN (see lib/ip-blocks.ts for the code side):
--   * Blocks are ALWAYS time-limited. Auto-blocks last exactly 24 hours;
--     the CHECK constraint below refuses any block longer than 24 hours
--     from its creation, so there is no permanent auto-block anywhere.
--   * An IP is blocked only after HIGH-velocity abuse, counted in
--     ip_abuse_events over a trailing 24 hours (thresholds in code):
--       signup_abuse   30 signup rate-limit (429) hits
--       admin_failure  50 failed admin logins
--       fake_payment   30 fake-payment signals (manual-proof 429s and
--                      rejected non-image "proof" uploads)
--       payment_abuse  30 payment create-order rate-limit (429) hits
--     A typo or two can never trip these. Changing IPs alone is NOT a
--     trigger (mobile networks rotate, CGNAT shares addresses) — only
--     repeated failed/abusive attempts from one IP count.
--   * Deliberately NOT here: VPN/proxy detection (unreliable without a
--     paid IP-intelligence API), account-IP chaining / fingerprinting,
--     User-Agent blocking (UA is trivially spoofed), permanent blocks.
--   * This is NOT lib/engine/blocklist.ts: that table is the business
--     unsubscribe blocklist (domains/emails), never IPs. The two lists
--     are unrelated and must never be merged.
--
-- 1. Active blocks: one row per IP, expired rows are inert (the code
--    only honours blocked_until in the future) and may be left alone.
create table if not exists ip_blocks (
  ip text primary key,
  blocked_until timestamptz not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ip_blocks_window_check check (blocked_until > created_at),
  constraint ip_blocks_max_24h_check check (blocked_until <= created_at + interval '24 hours')
);
create index if not exists idx_ip_blocks_until on ip_blocks (blocked_until);
alter table ip_blocks enable row level security;
-- No policies: service-role only, same pattern as admin_login_failures.
-- (RLS on + no policy = anon/authenticated clients see nothing; the
-- server's service-role key bypasses RLS, exactly as intended.)

-- 2. Abuse-event records: the raw velocity evidence behind auto-blocks.
--    Kept small by design (one row per abusive hit, only for the four
--    kinds above). Old rows stop counting once they age past 24 hours;
--    the owner may prune them whenever (see the maintenance note below).
create table if not exists ip_abuse_events (
  id bigint generated always as identity primary key,
  ip text not null,
  kind text not null
    constraint ip_abuse_events_kind_check
    check (kind in ('signup_abuse', 'admin_failure', 'fake_payment', 'payment_abuse')),
  created_at timestamptz not null default now()
);
create index if not exists idx_ip_abuse_events_ip_kind_time
  on ip_abuse_events (ip, kind, created_at desc);
alter table ip_abuse_events enable row level security;
-- No policies: service-role only, same as ip_blocks above.

-- ADMIN UNBLOCK PATH (no UI exists yet — run in the SQL Editor):
--   delete from ip_blocks where ip = '<the-ip>';
-- That single delete unblocks immediately; the abuse-event rows stay
-- as history, but a fresh auto-block needs a full new threshold of
-- events, so deleting the block is enough.
--
-- MANUAL BLOCK (rare, owner-only, still capped at 24 hours by the
-- CHECK constraint — a longer window is refused by the database):
--   insert into ip_blocks (ip, blocked_until, reason)
--   values ('<the-ip>', now() + interval '24 hours', 'manual: <why>')
--   on conflict (ip) do update set
--     blocked_until = now() + interval '24 hours',
--     reason = excluded.reason,
--     created_at = now(),
--     updated_at = now();
--
-- OPTIONAL MAINTENANCE (owner-run, never automatic): prune abuse events
-- older than 90 days. Blocks themselves need no pruning — expired rows
-- are inert and the primary key keeps the table to one row per IP.
--   delete from ip_abuse_events where created_at < now() - interval '90 days';

-- Verification (expect: both tables = 1, both RLS on = true):
-- select count(*) as ip_blocks_table from information_schema.tables
--   where table_name = 'ip_blocks';
-- select count(*) as ip_abuse_events_table from information_schema.tables
--   where table_name = 'ip_abuse_events';
-- select tablename, rowsecurity from pg_tables
--   where tablename in ('ip_blocks', 'ip_abuse_events');
