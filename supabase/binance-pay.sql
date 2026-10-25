-- Binance Pay gateway support (apply in the MAIN Supabase project's SQL editor).
--
-- Adds 'binance' to the payments.gateway check constraint so Binance Pay
-- orders (pending rows + captured rows) can be recorded. Without this,
-- the Binance checkout's pending-row insert fails and webhook
-- auto-activation is unavailable (the verify button still works).
-- Idempotent: safe to run twice.
--
-- Activation checklist (owner):
--   1. Create + verify a Binance merchant account (merchant.binance.com).
--   2. Developers -> API -> Generate API Key (save key + secret at once).
--   3. Vercel Production env (sensitive): BINANCE_PAY_API_KEY,
--      BINANCE_PAY_SECRET_KEY. Env vars apply to NEW deployments only,
--      so redeploy after adding them.
--   4. Binance merchant portal webhook URL:
--      https://leadsforcegen.vercel.app/api/payments/binance/webhook
--   5. Run this SQL, then test: checkout -> Binance Pay -> pay 19 USDT
--      -> Pro activates via webhook or the verify button.

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'payments_gateway_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments drop constraint payments_gateway_check;
  end if;
end $$;

alter table public.payments
  add constraint payments_gateway_check
  check (gateway in ('razorpay', 'stripe', 'manual', 'lemonsqueezy', 'paddle', 'binance'));
