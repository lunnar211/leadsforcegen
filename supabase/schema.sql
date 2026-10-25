-- LeadsForceGen — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor) once.

create extension if not exists "pgcrypto";

-- ── Migrations for databases created with an earlier schema version ────
-- CREATE TABLE IF NOT EXISTS is a no-op on pre-existing tables, so columns
-- and constraints added since then must be applied explicitly (this is
-- what broke the first run: an older profiles table had no `role`
-- column, so is_admin() failed). Every statement here is also safe on a
-- completely fresh database.
alter table if exists profiles add column if not exists email text;
alter table if exists profiles add column if not exists plan text not null default 'free';
alter table if exists profiles add column if not exists role text not null default 'user' check (role in ('user','admin'));
alter table if exists profiles add column if not exists is_active boolean not null default true;
alter table if exists profiles add column if not exists created_at timestamptz not null default now();

alter table if exists payments add column if not exists method text;
alter table if exists payments add column if not exists months int;
alter table if exists payments add column if not exists proof_path text;
-- 2026-10-24 security fixes: SHA-256 of the uploaded proof file, used to
-- reject duplicate pending proofs from the same user (sweep finding P1).
-- NOTE: the proof_hash INDEX lives AFTER the payments CREATE TABLE
-- below, not here: this header runs before payments is created, so a
-- CREATE INDEX here would error on a fresh database (missing table).
-- The ALTER above is table-guarded (IF EXISTS) so it is harmless here
-- and still backfills existing databases; the post-CREATE copy below
-- is what guarantees a fresh database gets the column + index.
alter table if exists payments add column if not exists proof_hash text;

-- 2026-10-24 security fixes: durable admin-login failure counters.
-- The old counters lived in Upstash (unconfigured) or per-instance
-- memory, so the 5-fail/15-min lockout never engaged on serverless.
-- This table is shared across instances; RLS is ON with no client
-- policies, so only the service role can read/write it.
create table if not exists admin_login_failures (
  key text primary key,
  failures int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table admin_login_failures enable row level security;
-- Paddle added as a gateway (2026-10-23), Binance Pay added 2026-10-25
-- (supabase/binance-pay.sql, applied live): widen the gateway CHECK on
-- databases created before those gateways existed.
-- AUDIT FIX 2026-10-25: the DO block below previously re-added this
-- CHECK WITHOUT 'paddle'/'binance', so re-running this file on the live
-- database would have stripped both gateways — and failed outright if
-- paddle/binance rows already existed (CHECK validation on ADD).
-- The gateway set here must always stay a superset of every gateway
-- the code inserts (razorpay, stripe, manual, lemonsqueezy, paddle,
-- binance); binance-pay.sql re-adds exactly this same set.
alter table if exists payments drop constraint if exists payments_gateway_check;
alter table if exists payments add constraint payments_gateway_check check (gateway in ('razorpay','stripe','manual','lemonsqueezy','paddle','binance'));

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'payments_gateway_check' and conrelid = 'public.payments'::regclass) then
    alter table payments drop constraint payments_gateway_check;
    alter table payments add constraint payments_gateway_check
      check (gateway in ('razorpay','stripe','manual','lemonsqueezy','paddle','binance'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'payments_status_check') then
    alter table payments drop constraint payments_status_check;
    alter table payments add constraint payments_status_check
      check (status in ('pending','captured','rejected','refunded'));
  end if;
end $$;

create table if not exists profiles (
  id uuid primary key,
  email text unique,
  plan text not null default 'free' check (plan in ('free','pro')),
  role text not null default 'user' check (role in ('user','admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  company text, industry text, location text, size text,
  website text, description text, score int,
  created_at timestamptz not null default now()
);

create table if not exists searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  industry text, location text, keywords text, result_count int default 0,
  created_at timestamptz not null default now()
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  plan text not null default 'pro',
  status text not null default 'active',
  gateway text,
  gateway_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- Payments: UNIQUE gateway ids are the duplicate-payment protection.
-- A replayed webhook, double click, or retried verify can never insert the
-- same payment twice; handlers also check existence before processing.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  email text,
  gateway text not null check (gateway in ('razorpay','stripe','manual','lemonsqueezy','paddle','binance')),
  gateway_payment_id text unique,
  gateway_order_id text unique,
  plan text not null default 'pro',
  amount bigint not null,
  currency text not null,
  status text not null default 'captured' check (status in ('pending','captured','rejected','refunded')),
  method text,
  months int,
  proof_path text,
  created_at timestamptz not null default now()
);

-- proof_hash backfill for FRESH databases (see header note): the
-- header ALTER is skipped when payments does not exist yet, so without
-- this a fresh database would lack the column the manual-proof route
-- tries first, and would have no dedupe index. On existing databases
-- both statements are no-ops (column exists, index exists).
alter table if exists payments add column if not exists proof_hash text;
create index if not exists idx_payments_proof_hash on payments (user_id, proof_hash, status);

-- Private bucket for manual-payment proof images (service-role access only).
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- Webhook dedupe: one row per gateway event id, ever.
create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  gateway text not null,
  gateway_event_id text not null,
  type text,
  created_at timestamptz not null default now(),
  unique (gateway, gateway_event_id)
);

create index if not exists idx_leads_user on leads(user_id);
create index if not exists idx_searches_user on searches(user_id);
create index if not exists idx_activity_user on activity_log(user_id);
create index if not exists idx_payments_user on payments(user_id);
create index if not exists idx_profiles_plan on profiles(plan);

-- RLS stubs: enable RLS and let users read/write only their own rows.
-- Admin access should be gated by profiles.role = 'admin' (add admin
-- policies with a security-definer helper before exposing admin writes).
create table if not exists unsubscribe_blocklist (
  id uuid primary key default gen_random_uuid(),
  domain text,
  email text,
  company text,
  created_at timestamptz not null default now()
);
create index if not exists idx_unsubscribe_domain on unsubscribe_blocklist (domain);
create index if not exists idx_unsubscribe_email on unsubscribe_blocklist (email);

-- Server-side daily quota. The client NEVER decides usage; API routes call
-- consume_daily_quota() which increments atomically under the plan limit.
create table if not exists daily_usage (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null default ((now() at time zone 'utc')::date),
  used int not null default 0,
  primary key (user_id, day)
);

create or replace function consume_daily_quota(p_user uuid, p_amount int, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_used int;
begin
  insert into daily_usage (user_id, day, used)
  values (p_user, v_day, p_amount)
  on conflict (user_id, day) do update
    set used = daily_usage.used + p_amount
    where daily_usage.used + p_amount <= p_limit
  returning used into v_used;
  return v_used is not null;
end;
$$;

-- Admin helper for RLS policies.
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

alter table profiles enable row level security;
alter table leads enable row level security;
alter table searches enable row level security;
alter table activity_log enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table webhook_events enable row level security;
alter table unsubscribe_blocklist enable row level security;
alter table daily_usage enable row level security;

-- RLS policies (idempotent: dropped first so re-running this file is safe).
-- The service role bypasses RLS; it is used ONLY by server routes.
-- webhook_events and unsubscribe_blocklist intentionally have NO client
-- policies — with RLS on and no policy, clients can neither read nor write.
drop policy if exists "profiles_select_own_or_admin" on profiles;
create policy "profiles_select_own_or_admin" on profiles
  for select using (auth.uid() = id or is_admin());
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);
-- No client UPDATE policy on profiles: plan/role changes happen only via
-- verified server paths (payments, admin) using the service role.

drop policy if exists "leads_own" on leads;
create policy "leads_own" on leads
  for all using (auth.uid() = user_id or is_admin()) with check (auth.uid() = user_id);
drop policy if exists "searches_own" on searches;
create policy "searches_own" on searches
  for all using (auth.uid() = user_id or is_admin()) with check (auth.uid() = user_id);
drop policy if exists "activity_select_own_or_admin" on activity_log;
create policy "activity_select_own_or_admin" on activity_log
  for select using (auth.uid() = user_id or is_admin());
drop policy if exists "activity_insert_own" on activity_log;
create policy "activity_insert_own" on activity_log
  for insert with check (auth.uid() = user_id);
drop policy if exists "subscriptions_select_own_or_admin" on subscriptions;
create policy "subscriptions_select_own_or_admin" on subscriptions
  for select using (auth.uid() = user_id or is_admin());
drop policy if exists "payments_select_own_or_admin" on payments;
create policy "payments_select_own_or_admin" on payments
  for select using (auth.uid() = user_id or is_admin());
drop policy if exists "daily_usage_select_own_or_admin" on daily_usage;
create policy "daily_usage_select_own_or_admin" on daily_usage
  for select using (auth.uid() = user_id or is_admin());
-- daily_usage writes happen only inside consume_daily_quota() (definer).

-- Lead engine cache (server-internal; service-role only, no client policies).
create table if not exists public.search_cache (
  cache_key text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.search_cache enable row level security;

-- ── Admin expansion (2026-10-23): coupons, support tickets, site settings ──
-- All three are server-internal (service-role only, RLS on, no policies),
-- exactly like search_cache: the browser never touches them directly.
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  percent_off int not null check (percent_off between 1 and 90),
  active boolean not null default true,
  max_uses int,
  used_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.coupons enable row level security;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open','answered','closed')),
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;

alter table if exists payments add column if not exists coupon_code text;

-- ── Privilege-escalation guard (2026-10-23, found by the owner's self-hack) ──
-- A leftover starter-template UPDATE policy on profiles let any signed-in
-- user PATCH their own row's plan/role (RLS guards rows, not columns).
-- Defence in depth, durable across schema re-runs:
--  1. Drop every client UPDATE/ALL policy on profiles (plan/role changes
--     are service-role only, by design).
--  2. A trigger freezes plan/role/is_active for any non-service-role
--     writer, on INSERT and UPDATE alike.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='profiles' and cmd in ('UPDATE','ALL') loop
    execute format('drop policy if exists %I on public.profiles', p.policyname);
  end loop;
end $$;
create or replace function public.guard_profile_privileges() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('postgres','supabase_admin') or coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    new.plan := 'free'; new.role := 'user'; new.is_active := true;
  elsif tg_op = 'UPDATE' then
    new.plan := old.plan; new.role := old.role; new.is_active := old.is_active;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges before insert or update on public.profiles for each row execute function public.guard_profile_privileges();
