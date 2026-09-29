-- Tank purchases are entitlements, not shippable orders. Keep them in their
-- own private table and use the existing token transaction ledger for grants.

alter table public.tank_profiles
  add column if not exists season_pass_active boolean not null default false,
  add column if not exists season_pass_purchased_at timestamptz null;

create table if not exists public.tank_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_key text not null check (
    product_key in ('season_pass', 'tokens_500', 'tokens_1500', 'tokens_5000', 'room_vip')
  ),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  stripe_mode text not null check (stripe_mode in ('test', 'live')),
  stripe_payment_intent_id text null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  fulfilled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tank_purchases_payment_intent_unique unique (stripe_mode, stripe_payment_intent_id)
);

create index if not exists tank_purchases_user_created_idx
  on public.tank_purchases (user_id, created_at desc);
create index if not exists tank_purchases_status_idx
  on public.tank_purchases (status, created_at)
  where status <> 'paid';

alter table public.tank_purchases enable row level security;
revoke all on table public.tank_purchases from public, anon, authenticated;
revoke all on table public.tank_purchases from service_role;
grant select, insert, update on table public.tank_purchases to service_role;

comment on table public.tank_purchases is
  'Private Tank Stripe purchase and entitlement state. Test and live purchases remain distinct.';

alter table public.tank_token_transactions
  add column if not exists purchase_id uuid null references public.tank_purchases(id) on delete restrict;

create unique index if not exists tank_token_transactions_purchase_uidx
  on public.tank_token_transactions (purchase_id)
  where purchase_id is not null;
