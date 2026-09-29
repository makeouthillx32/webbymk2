-- Private, Stripe-reconciled funds ledger. Amounts are copied from Stripe
-- Balance Transactions, whose signed net value is the authoritative impact on
-- the Stripe balance. This is net payment revenue, not accounting profit:
-- product cost, shipping expense, tax liabilities, and payroll are separate.

create table if not exists public.payment_financial_entries (
  id uuid primary key default gen_random_uuid(),
  stripe_balance_transaction_id text not null,
  stripe_charge_id text null,
  stripe_payment_intent_id text null,
  stripe_refund_id text null,
  lane text not null check (lane in ('shop', 'labs', 'pos', 'tank')),
  mode text not null check (mode in ('test', 'live')),
  entry_type text not null check (entry_type in ('charge', 'refund')),
  amount_cents bigint not null,
  fee_cents bigint not null,
  net_cents bigint not null,
  currency text not null check (currency ~ '^[a-z]{3}$'),
  stripe_status text not null check (stripe_status in ('available', 'pending')),
  reporting_category text not null,
  order_id uuid null,
  tank_purchase_id uuid null,
  occurred_at timestamptz not null,
  available_on timestamptz not null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_financial_entries_balance_tx_unique
    unique (mode, stripe_balance_transaction_id),
  constraint payment_financial_entries_one_owner
    check (num_nonnulls(order_id, tank_purchase_id) <= 1)
);

create index if not exists payment_financial_entries_mode_occurred_idx
  on public.payment_financial_entries (mode, occurred_at desc);
create index if not exists payment_financial_entries_lane_mode_occurred_idx
  on public.payment_financial_entries (lane, mode, occurred_at desc);
create index if not exists payment_financial_entries_payment_intent_idx
  on public.payment_financial_entries (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table public.payment_financial_entries enable row level security;
revoke all on table public.payment_financial_entries from public, anon, authenticated;
revoke all on table public.payment_financial_entries from service_role;
grant select, insert, update on table public.payment_financial_entries to service_role;

comment on table public.payment_financial_entries is
  'Private Stripe balance-transaction mirror. Test and live money are permanently separated. Net is Stripe proceeds, not full accounting profit.';

create or replace function public.get_payment_financial_summary(
  p_mode text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
) returns table (
  mode text,
  lane text,
  gross_cents bigint,
  fee_cents bigint,
  refund_cents bigint,
  net_cents bigint,
  transaction_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.mode,
    e.lane,
    coalesce(sum(e.amount_cents) filter (where e.entry_type = 'charge'), 0)::bigint as gross_cents,
    coalesce(sum(e.fee_cents), 0)::bigint as fee_cents,
    abs(coalesce(sum(e.amount_cents) filter (where e.entry_type = 'refund'), 0))::bigint as refund_cents,
    coalesce(sum(e.net_cents), 0)::bigint as net_cents,
    count(*)::bigint as transaction_count
  from public.payment_financial_entries e
  where (p_mode is null or e.mode = p_mode)
    and (p_from is null or e.occurred_at >= p_from)
    and (p_to is null or e.occurred_at < p_to)
  group by e.mode, e.lane
  order by e.mode, e.lane;
$$;

revoke all on function public.get_payment_financial_summary(text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_payment_financial_summary(text, timestamptz, timestamptz)
  to service_role;

create or replace function public.get_payment_financial_daily(
  p_mode text,
  p_from timestamptz,
  p_to timestamptz
) returns table (
  day date,
  gross_cents bigint,
  fee_cents bigint,
  refund_cents bigint,
  net_cents bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (e.occurred_at at time zone 'UTC')::date as day,
    coalesce(sum(e.amount_cents) filter (where e.entry_type = 'charge'), 0)::bigint as gross_cents,
    coalesce(sum(e.fee_cents), 0)::bigint as fee_cents,
    abs(coalesce(sum(e.amount_cents) filter (where e.entry_type = 'refund'), 0))::bigint as refund_cents,
    coalesce(sum(e.net_cents), 0)::bigint as net_cents
  from public.payment_financial_entries e
  where e.mode = p_mode
    and e.occurred_at >= p_from
    and e.occurred_at < p_to
  group by (e.occurred_at at time zone 'UTC')::date
  order by day;
$$;

revoke all on function public.get_payment_financial_daily(text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_payment_financial_daily(text, timestamptz, timestamptz)
  to service_role;
