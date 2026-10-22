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
  gateway text not null check (gateway in ('razorpay','stripe')),
  gateway_payment_id text unique,
  gateway_order_id text unique,
  plan text not null default 'pro',
  amount bigint not null,
  currency text not null,
  status text not null default 'captured',
  created_at timestamptz not null default now()
);

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
alter table profiles enable row level security;
alter table leads enable row level security;
alter table searches enable row level security;
alter table activity_log enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table webhook_events enable row level security;

-- Example per-user policies (uncomment / adapt in the SQL editor):
-- create policy "own profile" on profiles for select using (auth.uid() = id);
-- create policy "own leads" on leads for all using (auth.uid() = user_id);
-- create policy "own searches" on searches for all using (auth.uid() = user_id);
-- Payments and webhook_events should normally be written ONLY by the
-- service role (server routes), which bypasses RLS. Do not add public
-- insert policies for them.
