-- Durable Stripe Billing state for Tank's two recurring season-pass tiers.
-- Token packs remain one-time PaymentIntents.

alter table public.tank_profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists season_pass_status text;

alter table public.tank_profiles
  drop constraint if exists tank_profiles_season_pass_status_check;
alter table public.tank_profiles
  add constraint tank_profiles_season_pass_status_check
  check (
    season_pass_status is null
    or season_pass_status in (
      'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due',
      'canceled', 'unpaid', 'paused'
    )
  );

create unique index if not exists tank_profiles_stripe_customer_uidx
  on public.tank_profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists tank_profiles_stripe_subscription_uidx
  on public.tank_profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.tank_purchases
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_subscription_id text;

alter table public.tank_purchases
  drop constraint if exists tank_purchases_product_key_check;
alter table public.tank_purchases
  add constraint tank_purchases_product_key_check
  check (
    product_key in (
      'season_pass', 'season_pass_xl',
      'tokens_500', 'tokens_1500', 'tokens_5000', 'room_vip'
    )
  );

create unique index if not exists tank_purchases_checkout_session_uidx
  on public.tank_purchases (stripe_mode, stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists tank_purchases_subscription_idx
  on public.tank_purchases (stripe_mode, stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.tank_token_transactions
  add column if not exists stripe_invoice_id text;

create unique index if not exists tank_token_transactions_stripe_invoice_uidx
  on public.tank_token_transactions (stripe_invoice_id)
  where stripe_invoice_id is not null;

comment on column public.tank_token_transactions.stripe_invoice_id is
  'Idempotency key for the monthly token allowance granted by invoice.paid.';
