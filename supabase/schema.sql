-- LeadsForceGen — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor) once.

create extension if not exists "pgcrypto";

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
  gateway text not null check (gateway in ('razorpay','stripe','manual','lemonsqueezy')),
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
