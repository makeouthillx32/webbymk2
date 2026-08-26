-- 20260803_creator_affiliate_program.sql
-- Creator / affiliate program: tiered discount codes, commission ledger, cash-outs.
--
-- Model:
--   * Admin creates a creator (from an existing profile) and assigns a tier
--     (a percent-off value). Creating a creator also creates a `discounts`
--     row for their code, so the existing checkout/promo-code flow (see
--     app/api/checkout/create-payment-intent/route.ts) needs zero changes.
--   * Commission mirrors the discount: whatever a customer saved on an order
--     using the creator's code (orders.discount_cents) is exactly what the
--     creator earns on that order. No separate commission % to manage.
--   * Money is virtual/tracked only — nothing here moves real funds. Payouts
--     happen manually, outside this system, from the shared Stripe balance;
--     admins just mark a cash-out request as paid or failed.
--   * All writes go through service-role-only RPCs called from the app's
--     service-role client (src/utils/supabase/admin.ts) so balances can't be
--     raced or tampered with client-side. RLS below is service_role-only,
--     matching the convention in 20260712_sites_apps_catalog.sql.

-- ── Tiers ───────────────────────────────────────────────────────────────────
create table if not exists public.creator_tiers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  percent_off  numeric(5,2) not null check (percent_off > 0 and percent_off <= 100),
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

insert into public.creator_tiers (name, percent_off, sort_order)
select * from (values
  ('Standard', 10.00, 1),
  ('Pro',      15.00, 2),
  ('Elite',    20.00, 3)
) as seed(name, percent_off, sort_order)
where not exists (select 1 from public.creator_tiers);

-- ── Creators ────────────────────────────────────────────────────────────────
create table if not exists public.creators (
  id                       uuid primary key default gen_random_uuid(),
  profile_id               uuid not null references public.profiles(id) on delete cascade,
  tier_id                   uuid not null references public.creator_tiers(id),
  discount_id               uuid not null references public.discounts(id) on delete restrict,
  status                    text not null default 'active' check (status in ('active','paused','removed')),
  balance_cents             int not null default 0 check (balance_cents >= 0),
  lifetime_earned_cents     int not null default 0 check (lifetime_earned_cents >= 0),
  lifetime_paid_cents       int not null default 0 check (lifetime_paid_cents >= 0),
  cashout_threshold_cents   int not null default 10000 check (cashout_threshold_cents > 0),
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (profile_id),
  unique (discount_id)
);

create index if not exists creators_status_idx on public.creators(status);

-- ── Ledger (audit trail for every balance change) ──────────────────────────
create table if not exists public.creator_ledger_entries (
  id             uuid primary key default gen_random_uuid(),
  creator_id     uuid not null references public.creators(id) on delete cascade,
  order_id       uuid references public.orders(id) on delete set null,
  order_number   text,
  discount_code  text,
  kind           text not null check (kind in ('earned','reversal','adjustment')),
  amount_cents   int not null,
  description    text,
  created_at     timestamptz not null default now()
);

create index if not exists creator_ledger_entries_creator_id_idx on public.creator_ledger_entries(creator_id);
create index if not exists creator_ledger_entries_order_id_idx on public.creator_ledger_entries(order_id);
create unique index if not exists creator_ledger_entries_order_kind_uidx
  on public.creator_ledger_entries(order_id, kind)
  where order_id is not null and kind in ('earned', 'reversal');

-- ── Cash-out requests ───────────────────────────────────────────────────────
create table if not exists public.creator_cashouts (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid not null references public.creators(id) on delete cascade,
  amount_cents    int not null check (amount_cents > 0),
  status          text not null default 'requested' check (status in ('requested','paid','failed','cancelled')),
  requested_at    timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles(id),
  failure_reason  text,
  admin_notes     text
);

create index if not exists creator_cashouts_creator_id_idx on public.creator_cashouts(creator_id);
create index if not exists creator_cashouts_status_idx on public.creator_cashouts(status);

-- One pending request per creator at a time.
create unique index if not exists creator_cashouts_one_pending_idx
  on public.creator_cashouts(creator_id)
  where (status = 'requested');

-- ── RLS: service_role only. All access is mediated by API routes using the
--    service-role client, which enforce their own scoping (see admin.ts). ──
alter table public.creator_tiers          enable row level security;
alter table public.creators               enable row level security;
alter table public.creator_ledger_entries enable row level security;
alter table public.creator_cashouts       enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'creator_tiers','creators','creator_ledger_entries','creator_cashouts'
  ] loop
    execute format(
      'drop policy if exists service_key_full_access on public.%I', t);
    execute format(
      'create policy service_key_full_access on public.%I for all
         using ((select auth.role()) = ''service_role'')
         with check ((select auth.role()) = ''service_role'')', t);
  end loop;
end $$;

-- ── RPC: request a cash-out ─────────────────────────────────────────────────
create or replace function public.request_creator_cashout(p_creator_id uuid)
returns public.creator_cashouts
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_creator public.creators;
  v_cashout public.creator_cashouts;
begin
  select * into v_creator from public.creators where id = p_creator_id for update;

  if not found then
    raise exception 'Creator not found';
  end if;

  if v_creator.status <> 'active' then
    raise exception 'This creator account is % and cannot request a cash-out.', v_creator.status;
  end if;

  if exists (
    select 1 from public.creator_cashouts
    where creator_id = p_creator_id and status = 'requested'
  ) then
    raise exception 'A cash-out request is already pending.';
  end if;

  if v_creator.balance_cents < v_creator.cashout_threshold_cents then
    raise exception 'Balance ($%) is below the $% cash-out minimum.',
      to_char(v_creator.balance_cents / 100.0, 'FM999999990.00'),
      to_char(v_creator.cashout_threshold_cents / 100.0, 'FM999999990.00');
  end if;

  insert into public.creator_cashouts (creator_id, amount_cents)
  values (p_creator_id, v_creator.balance_cents)
  returning * into v_cashout;

  return v_cashout;
end;
$$;

-- ── RPC: admin resolves a cash-out (paid / failed) ─────────────────────────
create or replace function public.resolve_creator_cashout(
  p_cashout_id uuid,
  p_action text,
  p_failure_reason text default null,
  p_admin_notes text default null,
  p_resolved_by uuid default null
)
returns public.creator_cashouts
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cashout public.creator_cashouts;
begin
  if p_action not in ('paid','failed') then
    raise exception 'Invalid action: %. Expected paid or failed.', p_action;
  end if;

  select * into v_cashout from public.creator_cashouts where id = p_cashout_id for update;

  if not found then
    raise exception 'Cash-out request not found';
  end if;

  if v_cashout.status <> 'requested' then
    raise exception 'Cash-out request is already %.', v_cashout.status;
  end if;

  if p_action = 'paid' then
    update public.creators
      set balance_cents = balance_cents - v_cashout.amount_cents,
          lifetime_paid_cents = lifetime_paid_cents + v_cashout.amount_cents,
          updated_at = now()
      where id = v_cashout.creator_id;

    update public.creator_cashouts
      set status = 'paid', resolved_at = now(), resolved_by = p_resolved_by, admin_notes = p_admin_notes
      where id = p_cashout_id
      returning * into v_cashout;
  else
    update public.creator_cashouts
      set status = 'failed', resolved_at = now(), resolved_by = p_resolved_by,
          failure_reason = p_failure_reason, admin_notes = p_admin_notes
      where id = p_cashout_id
      returning * into v_cashout;
  end if;

  return v_cashout;
end;
$$;

-- ── RPC: credit commission when an order paid with a creator code succeeds ─
create or replace function public.credit_creator_commission(
  p_order_id uuid,
  p_promo_code text,
  p_discount_cents int,
  p_order_number text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_creator_id uuid;
begin
  if p_promo_code is null or p_discount_cents is null or p_discount_cents <= 0 then
    return;
  end if;

  -- Idempotency: webhooks can retry/redeliver.
  if exists (
    select 1 from public.creator_ledger_entries
    where order_id = p_order_id and kind = 'earned'
  ) then
    return;
  end if;

  select c.id into v_creator_id
  from public.creators c
  join public.discounts d on d.id = c.discount_id
  where upper(d.code) = upper(p_promo_code)
    and c.status <> 'removed'
  limit 1;

  if v_creator_id is null then
    return;
  end if;

  insert into public.creator_ledger_entries
    (creator_id, order_id, order_number, discount_code, kind, amount_cents, description)
  values
    (v_creator_id, p_order_id, p_order_number, upper(p_promo_code), 'earned', p_discount_cents,
     'Commission for order ' || coalesce(p_order_number, p_order_id::text));

  update public.creators
    set balance_cents = balance_cents + p_discount_cents,
        lifetime_earned_cents = lifetime_earned_cents + p_discount_cents,
        updated_at = now()
    where id = v_creator_id;
end;
$$;

-- ── RPC: reverse commission when an order paid with a creator code refunds ─
create or replace function public.reverse_creator_commission(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry public.creator_ledger_entries;
begin
  select * into v_entry
  from public.creator_ledger_entries
  where order_id = p_order_id and kind = 'earned'
  limit 1;

  if not found then
    return;
  end if;

  -- Idempotency guard.
  if exists (
    select 1 from public.creator_ledger_entries
    where order_id = p_order_id and kind = 'reversal'
  ) then
    return;
  end if;

  insert into public.creator_ledger_entries
    (creator_id, order_id, order_number, discount_code, kind, amount_cents, description)
  values
    (v_entry.creator_id, p_order_id, v_entry.order_number, v_entry.discount_code, 'reversal',
     -v_entry.amount_cents, 'Reversal — order refunded');

  update public.creators
    set balance_cents = greatest(0, balance_cents - v_entry.amount_cents),
        updated_at = now()
    where id = v_entry.creator_id;
end;
$$;

-- RPCs are service-only. PostgreSQL grants EXECUTE on new functions to
-- PUBLIC by default, so revoke it explicitly even though table RLS is enabled.
revoke all on function public.request_creator_cashout(uuid) from public, anon, authenticated;
revoke all on function public.resolve_creator_cashout(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.credit_creator_commission(uuid, text, int, text) from public, anon, authenticated;
revoke all on function public.reverse_creator_commission(uuid) from public, anon, authenticated;

grant execute on function public.request_creator_cashout(uuid) to service_role;
grant execute on function public.resolve_creator_cashout(uuid, text, text, text, uuid) to service_role;
grant execute on function public.credit_creator_commission(uuid, text, int, text) to service_role;
grant execute on function public.reverse_creator_commission(uuid) to service_role;
