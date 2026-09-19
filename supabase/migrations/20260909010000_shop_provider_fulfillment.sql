-- Provider-neutral Shop fulfillment bridge.
-- Shop remains authoritative for products, orders, and customer-facing status;
-- vendor records are downstream mappings, jobs, and signed callback evidence.

alter table public.orders
  add column if not exists stripe_mode text null
  check (stripe_mode in ('test', 'live'));

-- Backfill only when Stripe's private financial ledger has one unambiguous mode
-- for the order. Legacy orders without evidence remain null and cannot dispatch.
update public.orders o
set stripe_mode = evidence.mode
from (
  select order_id, min(mode) as mode
  from public.payment_financial_entries
  where order_id is not null
  group by order_id
  having count(distinct mode) = 1
) evidence
where o.id = evidence.order_id
  and o.stripe_mode is null;

create table if not exists public.fulfillment_providers (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null unique,
  display_name text not null,
  status text not null default 'evaluating'
    check (status in ('evaluating', 'test', 'active', 'paused', 'disabled')),
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.fulfillment_providers(id) on delete restrict,
  trigger_kind text not null default 'manual'
    check (trigger_kind in ('manual', 'scheduled', 'webhook')),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial', 'failed', 'stale')),
  products_seen integer not null default 0 check (products_seen >= 0),
  products_created integer not null default 0 check (products_created >= 0),
  products_updated integer not null default 0 check (products_updated >= 0),
  products_archived integer not null default 0 check (products_archived >= 0),
  products_failed integer not null default 0 check (products_failed >= 0),
  error_message text null,
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null
);

-- The partial unique index is the lock. Two requests may race, but only one
-- can acquire a running sync for a provider.
create unique index if not exists provider_catalog_one_running_idx
  on public.provider_catalog_sync_runs (provider_id)
  where status = 'running';

create table if not exists public.provider_products (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.fulfillment_providers(id) on delete restrict,
  product_id uuid null references public.products(id) on delete set null,
  external_product_id text not null,
  external_saved_design_id text null,
  sync_status text not null default 'draft'
    check (sync_status in ('draft', 'synced', 'needs_review', 'error', 'archived')),
  raw_payload jsonb not null default '{}'::jsonb,
  last_error text null,
  source_hash text null,
  source_updated_at timestamptz null,
  last_seen_at timestamptz null,
  last_seen_sync_id uuid null references public.provider_catalog_sync_runs(id) on delete set null,
  removed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, external_product_id)
);

create table if not exists public.provider_variant_mappings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.fulfillment_providers(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  external_product_id text not null,
  external_variant_id text null,
  external_sku text not null,
  active boolean not null default true,
  provider_cost_cents integer null check (provider_cost_cents is null or provider_cost_cents >= 0),
  provider_cost_currency text null,
  source_updated_at timestamptz null,
  last_seen_at timestamptz null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, external_sku),
  unique (provider_id, variant_id)
);

create table if not exists public.supplier_fulfillment_orders (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.fulfillment_providers(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_mode text not null check (payment_mode in ('test', 'live')),
  provider_environment text not null check (provider_environment in ('sandbox', 'live')),
  external_order_id text not null,
  status text not null default 'pending',
  raw_payload jsonb not null default '{}'::jsonb,
  last_event_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, external_order_id),
  constraint supplier_fulfillment_mode_match check (
    (payment_mode = 'test' and provider_environment = 'sandbox') or
    (payment_mode = 'live' and provider_environment = 'live')
  )
);

-- A blocked attempt is audit evidence, not a fake supplier order. Only a real
-- provider acceptance may supply an external_order_id and create the order row.
create table if not exists public.supplier_dispatch_attempts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.fulfillment_providers(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_mode text not null check (payment_mode in ('test', 'live')),
  requested_environment text not null check (requested_environment in ('sandbox', 'live')),
  decision text not null check (decision in ('blocked', 'allowed', 'failed')),
  reason_code text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.fulfillment_providers(id) on delete restrict,
  event_type text not null,
  dedupe_key text not null,
  signature_valid boolean not null default false,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'unmatched', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  error_message text null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  unique (provider_id, dedupe_key)
);

create table if not exists public.supplier_warehouse_shipments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.fulfillment_providers(id) on delete restrict,
  external_shipment_id text not null,
  name text null,
  status text not null default 'received',
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, external_shipment_id)
);

create table if not exists public.supplier_warehouse_shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.supplier_warehouse_shipments(id) on delete cascade,
  external_item_id text not null,
  inventory_id text null,
  sku text null,
  name text null,
  item_type text null,
  quantity_expected integer null,
  quantity_received integer null,
  receiving_errors text null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (shipment_id, external_item_id)
);

create or replace function public.enforce_supplier_fulfillment_order_mode()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  order_mode text;
  provider_status text;
  provider_has_sandbox boolean;
begin
  select o.stripe_mode
  into order_mode
  from public.orders o
  where o.id = new.order_id;

  select p.status, coalesce((p.capabilities ->> 'sandbox')::boolean, false)
  into provider_status, provider_has_sandbox
  from public.fulfillment_providers p
  where p.id = new.provider_id;

  if order_mode is null then
    raise exception using
      errcode = '23514',
      message = 'Vendor dispatch blocked: Shop order has no verified Stripe mode';
  end if;
  if new.payment_mode <> order_mode then
    raise exception using
      errcode = '23514',
      message = 'Vendor dispatch blocked: supplier payment mode does not match the Shop order';
  end if;
  if new.payment_mode = 'test' and new.provider_environment <> 'sandbox' then
    raise exception using
      errcode = '23514',
      message = 'Vendor dispatch blocked: Stripe test payment cannot use a live provider';
  end if;
  if new.payment_mode = 'test' and not provider_has_sandbox then
    raise exception using
      errcode = '23514',
      message = 'Vendor dispatch blocked: provider has no verified sandbox';
  end if;
  if new.payment_mode = 'test' and provider_status not in ('test', 'active') then
    raise exception using
      errcode = '23514',
      message = 'Vendor dispatch blocked: provider is not enabled for testing';
  end if;
  if new.payment_mode = 'live' and (new.provider_environment <> 'live' or provider_status <> 'active') then
    raise exception using
      errcode = '23514',
      message = 'Vendor dispatch blocked: live payment requires an active live provider';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_supplier_fulfillment_order_mode()
  from public, anon, authenticated;

drop trigger if exists supplier_fulfillment_order_mode_guard
  on public.supplier_fulfillment_orders;
create trigger supplier_fulfillment_order_mode_guard
before insert or update of provider_id, order_id, payment_mode, provider_environment
on public.supplier_fulfillment_orders
for each row execute function public.enforce_supplier_fulfillment_order_mode();

create index if not exists provider_products_product_idx
  on public.provider_products (product_id) where product_id is not null;
create index if not exists provider_variant_mappings_product_idx
  on public.provider_variant_mappings (product_id);
create index if not exists provider_variant_mappings_sku_idx
  on public.provider_variant_mappings (external_sku);
create index if not exists provider_catalog_sync_runs_recent_idx
  on public.provider_catalog_sync_runs (provider_id, started_at desc);
create index if not exists supplier_fulfillment_orders_order_idx
  on public.supplier_fulfillment_orders (order_id);
create index if not exists supplier_dispatch_attempts_order_idx
  on public.supplier_dispatch_attempts (order_id, created_at desc);
create index if not exists supplier_webhook_events_attention_idx
  on public.supplier_webhook_events (processing_status, received_at desc)
  where processing_status <> 'processed';

alter table public.fulfillment_providers enable row level security;
alter table public.provider_catalog_sync_runs enable row level security;
alter table public.provider_products enable row level security;
alter table public.provider_variant_mappings enable row level security;
alter table public.supplier_fulfillment_orders enable row level security;
alter table public.supplier_dispatch_attempts enable row level security;
alter table public.supplier_webhook_events enable row level security;
alter table public.supplier_warehouse_shipments enable row level security;
alter table public.supplier_warehouse_shipment_items enable row level security;

revoke all on table public.fulfillment_providers from public, anon, authenticated;
revoke all on table public.provider_catalog_sync_runs from public, anon, authenticated;
revoke all on table public.provider_products from public, anon, authenticated;
revoke all on table public.provider_variant_mappings from public, anon, authenticated;
revoke all on table public.supplier_fulfillment_orders from public, anon, authenticated;
revoke all on table public.supplier_dispatch_attempts from public, anon, authenticated;
revoke all on table public.supplier_webhook_events from public, anon, authenticated;
revoke all on table public.supplier_warehouse_shipments from public, anon, authenticated;
revoke all on table public.supplier_warehouse_shipment_items from public, anon, authenticated;

grant select, insert, update on table public.fulfillment_providers to service_role;
grant select, insert, update on table public.provider_catalog_sync_runs to service_role;
grant select, insert, update on table public.provider_products to service_role;
grant select, insert, update on table public.provider_variant_mappings to service_role;
grant select, insert, update on table public.supplier_fulfillment_orders to service_role;
grant select, insert on table public.supplier_dispatch_attempts to service_role;
grant select, insert, update on table public.supplier_webhook_events to service_role;
grant select, insert, update on table public.supplier_warehouse_shipments to service_role;
grant select, insert, update on table public.supplier_warehouse_shipment_items to service_role;

insert into public.fulfillment_providers (provider_key, display_name, status, capabilities)
values
  ('apliiq', 'Apliiq', 'test', '{"product_import":true,"product_search":true,"order_fulfillment":true,"tracking_webhook":true,"warehouse":true}'::jsonb),
  ('gelato', 'Gelato', 'evaluating', '{"product_import":true,"catalog_pull":true,"order_fulfillment":true,"sandbox":true,"tracking_webhook":true}'::jsonb),
  ('printful', 'Printful', 'evaluating', '{"product_import":true,"catalog_pull":true,"order_fulfillment":true,"tracking_webhook":true}'::jsonb),
  ('gooten', 'Gooten', 'evaluating', '{"catalog":true,"catalog_pull":true,"order_fulfillment":true,"tracking_webhook":true}'::jsonb),
  ('fourthwall', 'Fourthwall', 'evaluating', '{"storefront":true,"order_webhook":true,"tracking_webhook":true}'::jsonb),
  ('manual_vendor', 'Manual vendor', 'active', '{"manual":true}'::jsonb),
  ('local_inventory', 'Local inventory', 'active', '{"local_inventory":true}'::jsonb),
  ('digital', 'Digital delivery', 'active', '{"digital":true}'::jsonb)
on conflict (provider_key) do update set
  display_name = excluded.display_name,
  capabilities = excluded.capabilities,
  updated_at = now();

comment on table public.provider_products is
  'Private mapping between Shop products and vendor-side saved products/designs.';
comment on table public.provider_catalog_sync_runs is
  'Private durable history and one-at-a-time lock for vendor catalog imports.';
comment on table public.supplier_webhook_events is
  'Private idempotency and audit inbox for signed fulfillment-provider callbacks.';
comment on table public.supplier_dispatch_attempts is
  'Private audit of allowed and blocked vendor dispatch decisions. Blocked tests never receive fake external order IDs.';
