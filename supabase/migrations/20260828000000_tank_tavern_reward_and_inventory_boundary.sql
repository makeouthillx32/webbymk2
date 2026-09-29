-- Tank Tavern Phase 0: reward/inventory boundary + live bug fixes.
--
-- Fixes two confirmed double-application bugs. Root cause: tank_token_transactions
-- has an AFTER INSERT trigger (apply_tank_token_transaction) that already does
-- `tokens = tokens + NEW.amount`. Inserting into that table is a token mutation,
-- not passive bookkeeping. spinTankPrizeMachine() and claimDropTier() (in
-- src/zones/tank/server/actions.ts and dropCampaigns.ts) both ALSO manually
-- UPDATE tank_profiles.tokens with the same delta, double-applying it — spins
-- overcharge 2x, drop token rewards pay out 2x, live in production right now.
--
-- Also lands the centralized reward/inventory-grant boundary the rest of the
-- Tavern build (and the spec's own "existing reward paths migrate to the
-- atomic function" requirement) depends on.
--
-- NOTE: tank_record_mission_progress has the identical double-apply bug
-- internally (confirmed via pg_get_functiondef during planning) but is NOT
-- touched in this migration — the db.unenter MCP connection dropped mid-
-- session before this file could re-fetch its exact current body to write a
-- safe CREATE OR REPLACE. Flagged as a following, tiny fix once DB read
-- access is back: drop its redundant `UPDATE tank_profiles SET tokens = ...`
-- line, since the tank_token_transactions insert's trigger already applies it.
--
-- NOTE: tank_grant_reward() here has NO Click-bonus lookup — there is nothing
-- to bonus against before Tavern's tank_tavern_shifts table exists. Phase 1's
-- migration CREATE OR REPLACEs this function to add the bonus check; call
-- sites written against this Phase 0 signature do not change.

-- ── tank_reward_events: idempotent reward audit ─────────────────────────────
create table if not exists public.tank_reward_events (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  currency             text not null check (currency in ('tokens','xp')),
  base_amount          integer not null check (base_amount > 0),
  click_bonus_applied  boolean not null default false,
  final_amount         integer not null,
  -- 'mission' | 'watch' | 'chat_game' | 'drop' | 'tavern_chit' | ... — open text,
  -- not an enum, since new sources will be added as reward paths migrate over.
  source               text not null,
  source_id            uuid null,
  -- FK added once tank_tavern_shifts exists (Phase 1) — bare uuid for now.
  shift_id             uuid null,
  token_transaction_id uuid null references public.tank_token_transactions(id),
  idempotency_key      text not null,
  created_at           timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists tank_reward_events_user_idx on public.tank_reward_events (user_id, created_at desc);

alter table public.tank_reward_events enable row level security;

-- Rewards are private per spec ("inventory internals... remain private" /
-- reward internals not part of the public Tavern snapshot) — a user may read
-- their own history (for a future "my rewards" view), nothing else public.
create policy "Users can read their own reward events"
  on public.tank_reward_events
  for select
  using (auth.uid() = user_id);

create policy "Service role manages reward events"
  on public.tank_reward_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── tank_grant_reward: the centralized, idempotent reward boundary ─────────
create or replace function public.tank_grant_reward(
  p_user_id         uuid,
  p_base_amount     integer,
  p_currency        text,
  p_source          text,
  p_source_id       uuid default null,
  p_shift_id        uuid default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.tank_reward_events;
  v_final    integer;
  v_event_id uuid;
  v_txn_id   uuid;
  v_key      text := coalesce(p_idempotency_key, gen_random_uuid()::text);
begin
  if p_currency not in ('tokens', 'xp') then
    return jsonb_build_object('success', false, 'error', 'invalid currency');
  end if;
  if p_base_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'base amount must be positive');
  end if;

  select * into v_existing from public.tank_reward_events where idempotency_key = v_key;
  if found then
    return jsonb_build_object(
      'success', true, 'alreadyGranted', true,
      'baseAmount', v_existing.base_amount, 'clickBonusApplied', v_existing.click_bonus_applied,
      'finalAmount', v_existing.final_amount, 'rewardEventId', v_existing.id
    );
  end if;

  -- Phase 0: no Click-bonus math. See file header — Phase 1 adds it here.
  v_final := p_base_amount;

  if p_currency = 'tokens' then
    -- The AFTER INSERT trigger on tank_token_transactions applies this to
    -- tank_profiles.tokens. Do not also UPDATE tank_profiles here — that is
    -- exactly the bug this migration exists to fix.
    insert into public.tank_token_transactions (user_id, amount, reason)
    values (p_user_id, v_final, p_source)
    returning id into v_txn_id;
  else
    update public.tank_profiles set xp = xp + v_final where user_id = p_user_id;
  end if;

  insert into public.tank_reward_events
    (user_id, currency, base_amount, click_bonus_applied, final_amount, source, source_id, shift_id, token_transaction_id, idempotency_key)
  values
    (p_user_id, p_currency, p_base_amount, false, v_final, p_source, p_source_id, p_shift_id, v_txn_id, v_key)
  returning id into v_event_id;

  return jsonb_build_object(
    'success', true, 'alreadyGranted', false,
    'baseAmount', p_base_amount, 'clickBonusApplied', false,
    'finalAmount', v_final, 'rewardEventId', v_event_id
  );
exception
  when unique_violation then
    -- Race: a concurrent call with the same idempotency_key won first. Return its result.
    select * into v_existing from public.tank_reward_events where idempotency_key = v_key;
    return jsonb_build_object(
      'success', true, 'alreadyGranted', true,
      'baseAmount', v_existing.base_amount, 'clickBonusApplied', v_existing.click_bonus_applied,
      'finalAmount', v_existing.final_amount, 'rewardEventId', v_existing.id
    );
end;
$$;

revoke all on function public.tank_grant_reward(uuid, integer, text, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.tank_grant_reward(uuid, integer, text, text, uuid, uuid, text) to service_role;

-- ── tank_grant_inventory_item: centralized, locked, max-stack-safe grant ───
-- Replaces ~4 independently-duplicated "select quantity, upsert quantity+1"
-- call sites (chatRngEvents.ts's insertItemToInventory, spinTankPrizeMachine,
-- grantTankInventoryItemAction, craftTankFusion) with one locked, atomic path.
create or replace function public.tank_grant_inventory_item(
  p_user_id         uuid,
  p_item_slug       text,
  p_quantity        integer default 1,
  p_source          text default 'unknown',
  p_source_id       uuid default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item    public.tank_inventory_items;
  v_current integer;
  v_new_qty integer;
begin
  if p_quantity <= 0 then
    return jsonb_build_object('success', false, 'error', 'quantity must be positive');
  end if;

  select * into v_item from public.tank_inventory_items where slug = p_item_slug and is_active;
  if not found then
    return jsonb_build_object('success', false, 'error', 'unknown or inactive item');
  end if;

  -- Lock the existing row (if any) before deciding whether the grant fits
  -- under max_stack — this is the row-locking the prior duplicated call
  -- sites never had, which is what made them a lost-update race.
  select quantity into v_current
  from public.tank_player_inventory
  where user_id = p_user_id and item_id = v_item.id
  for update;

  v_current := coalesce(v_current, 0);
  v_new_qty := v_current + p_quantity;

  if v_item.max_stack is not null and v_new_qty > v_item.max_stack then
    -- Reject the whole acquisition. Never partial-grant, never silently
    -- destroy the excess, never charge the user for a grant that didn't land.
    return jsonb_build_object(
      'success', false, 'error', 'would exceed max stack',
      'currentQuantity', v_current, 'maxStack', v_item.max_stack
    );
  end if;

  insert into public.tank_player_inventory (user_id, item_id, quantity)
  values (p_user_id, v_item.id, v_new_qty)
  on conflict (user_id, item_id) do update set quantity = v_new_qty;

  return jsonb_build_object('success', true, 'newQuantity', v_new_qty, 'itemId', v_item.id);
end;
$$;

revoke all on function public.tank_grant_inventory_item(uuid, text, integer, text, uuid, text) from public, anon, authenticated;
grant execute on function public.tank_grant_inventory_item(uuid, text, integer, text, uuid, text) to service_role;

-- ── tank_inventory_items: generic item-effect fields ────────────────────────
-- Deliberately separate from audio_effect_type/audio_effect_payload — those
-- are the existing audio-pipeline plumbing; these are game-mechanic plumbing
-- for items like apron-snatcher (landing in Phase 1).
alter table public.tank_inventory_items add column if not exists effect_type text null;
alter table public.tank_inventory_items add column if not exists effect_payload jsonb not null default '{}'::jsonb;
alter table public.tank_inventory_items add column if not exists is_consumable boolean not null default false;
alter table public.tank_inventory_items add column if not exists max_stack integer null;
