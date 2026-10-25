-- Bulk email panel (Pro): campaigns, recipients, per-user provider settings.
-- Sending is restricted by design: the panel sends ONLY to lists the user
-- pastes or uploads themselves (their own contacts). It NEVER auto-blasts
-- the scraped lead database, and every mail carries an opt-out line plus
-- a one-click unsubscribe link wired to unsubscribe_blocklist.
-- Apply in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS).

create table if not exists public.email_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in ('brevo', 'resend', 'smtp')),
  key_enc text not null,
  sender_name text not null default '',
  sender_email text not null,
  webhook_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  template text not null default 'simple',
  status text not null default 'draft',
  total int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  opened int not null default 0,
  clicked int not null default 0,
  unsubscribed int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.email_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token text not null unique,
  status text not null default 'queued',
  error text,
  opened_at timestamptz,
  clicked_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_recipients_campaign_idx on public.email_recipients (campaign_id);
create index if not exists email_recipients_user_day_idx on public.email_recipients (user_id, created_at);
create index if not exists email_campaigns_user_idx on public.email_campaigns (user_id, created_at desc);

alter table public.email_settings enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_recipients enable row level security;

drop policy if exists "own settings" on public.email_settings;
create policy "own settings" on public.email_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own campaigns" on public.email_campaigns;
create policy "own campaigns" on public.email_campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own recipients" on public.email_recipients;
create policy "own recipients" on public.email_recipients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
