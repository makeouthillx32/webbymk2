-- Internal, service-role-only payment event ledger for Shop, Labs, POS, and Tank.
-- Stripe receives only routing identifiers; operational outcomes and inventory
-- expectations stay in our database. This is an observability ledger, not a
-- second source of truth for balances, orders, or inventory.

create table if not exists public.payment_lane_events (
  stripe_event_id text primary key,
  stripe_object_id text not null,
  stripe_event_type text not null,
  lane text not null check (lane in ('shop', 'labs', 'pos', 'tank')),
  mode text not null check (mode in ('test', 'live')),
  amount_cents bigint null check (amount_cents is null or amount_cents >= 0),
  currency text null check (currency is null or currency ~ '^[a-z]{3}$'),
  order_id uuid null,
  tank_purchase_id uuid null,
  product_key text null,
  processing_status text not null default 'processing'
    check (processing_status in ('processing', 'processed', 'failed')),
  fulfillment_status text not null default 'unknown',
  attempt_count integer not null default 1 check (attempt_count > 0),
  internal_summary jsonb not null default '{}'::jsonb,
  error_message text null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint payment_lane_events_one_owner check (
    num_nonnulls(order_id, tank_purchase_id) <= 1
  )
);

create index if not exists payment_lane_events_lane_created_idx
  on public.payment_lane_events (lane, received_at desc);
create index if not exists payment_lane_events_order_idx
  on public.payment_lane_events (order_id) where order_id is not null;
create index if not exists payment_lane_events_tank_purchase_idx
  on public.payment_lane_events (tank_purchase_id) where tank_purchase_id is not null;
create index if not exists payment_lane_events_attention_idx
  on public.payment_lane_events (processing_status, received_at)
  where processing_status <> 'processed' or fulfillment_status in ('failed', 'unknown');

alter table public.payment_lane_events enable row level security;
revoke all on table public.payment_lane_events from public, anon, authenticated;
revoke all on table public.payment_lane_events from service_role;
grant select, insert, update on table public.payment_lane_events to service_role;

comment on table public.payment_lane_events is
  'Private Stripe lane processing ledger. Stores allowlisted operational summaries only; never raw Stripe payloads or card data.';

create or replace function public.begin_payment_lane_event(
  p_stripe_event_id text,
  p_stripe_object_id text,
  p_stripe_event_type text,
  p_lane text,
  p_mode text,
  p_amount_cents bigint,
  p_currency text,
  p_order_id uuid,
  p_tank_purchase_id uuid,
  p_product_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.payment_lane_events (
    stripe_event_id, stripe_object_id, stripe_event_type, lane, mode,
    amount_cents, currency, order_id, tank_purchase_id, product_key
  ) values (
    p_stripe_event_id, p_stripe_object_id, p_stripe_event_type, p_lane, p_mode,
    p_amount_cents, p_currency, p_order_id, p_tank_purchase_id, p_product_key
  )
  on conflict (stripe_event_id) do update set
    attempt_count = public.payment_lane_events.attempt_count + 1,
    processing_status = 'processing',
    error_message = null,
    updated_at = now();
end;
$$;

revoke all on function public.begin_payment_lane_event(text, text, text, text, text, bigint, text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.begin_payment_lane_event(text, text, text, text, text, bigint, text, uuid, uuid, text)
  to service_role;
