-- Campaign auto-drain (Pro bulk email): let an opted-in campaign keep
-- sending day by day within the provider's daily cap, with no manual
-- Resume clicks. This is the legitimate version of "unlimited" — it
-- RESPECTS daily caps, never circumvents them.
--
-- Design: the message body is normally NOT persisted (see
-- app/api/email/send/route.ts). Auto-drain is the single exception:
-- when the user opts in at compose time, the body is stored encrypted
-- with the SAME AES-256-GCM helper + EMAIL_CREDENTIALS_SECRET used for
-- provider credentials (lib/email/crypto.ts). The body is cleared
-- (body_enc = null) as soon as the campaign finishes or the user stops
-- it, so bodies never linger after the campaign ends. Campaigns
-- WITHOUT auto-drain never store a body — existing behavior unchanged.
--
-- Apply in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS).
-- Until this file is applied, the code fails closed: opting into
-- auto-drain returns a 502 telling the owner to apply it, and every
-- other send path works exactly as before.

alter table public.email_campaigns
  add column if not exists body_enc text;

alter table public.email_campaigns
  add column if not exists auto_drain boolean not null default false;

create index if not exists email_campaigns_autodrain_idx
  on public.email_campaigns (auto_drain) where auto_drain = true;
