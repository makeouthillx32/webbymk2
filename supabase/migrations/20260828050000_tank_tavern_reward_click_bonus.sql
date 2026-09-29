-- Tank Tavern Phase 2: wires the broad Click Bonus into tank_grant_reward,
-- per confirmed decision #2 — whoever currently holds the Apron gets
-- +click_bonus_pct% on ANY included reward type (missions, watch rewards,
-- chat games, drops, Tavern chit outcomes), platform-wide, for the duration
-- of their shift, but only if their Click membership predates the shift
-- start (tank_tavern_shifts.click_bonus_applies, snapshotted at shift
-- creation so a mid-shift Click change can't retroactively grant/revoke it).
-- Deferred from Phase 0/1 because it needs tank_tavern_shifts + config to
-- exist. Integer round-half-up via round(numeric).

create or replace function public.tank_grant_reward(
  p_user_id        uuid,
  p_base_amount    integer,
  p_currency       text,
  p_source         text,
  p_source_id      uuid default null,
  p_shift_id       uuid default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing        public.tank_reward_events;
  v_final           integer;
  v_bonus_pct       integer;
  v_bonus_applied   boolean := false;
  v_event_id        uuid;
  v_txn_id          uuid;
  v_key             text := coalesce(p_idempotency_key, gen_random_uuid()::text);
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

  -- Broad Click Bonus: is p_user_id the current Bartender, and did their
  -- Click membership predate the shift start? Checked on every call, not
  -- just Tavern-sourced ones (confirmed decision #2).
  select cfg.click_bonus_pct into v_bonus_pct from public.tank_tavern_config cfg limit 1;
  v_bonus_pct := coalesce(v_bonus_pct, 20);

  select true into v_bonus_applied
  from public.tank_tavern_shifts s
  where s.status = 'active' and s.bartender_id = p_user_id and s.click_bonus_applies
  limit 1;
  v_bonus_applied := coalesce(v_bonus_applied, false);

  v_final := p_base_amount;
  if v_bonus_applied then
    v_final := p_base_amount + round(p_base_amount * v_bonus_pct / 100.0)::integer;
  end if;

  if p_currency = 'tokens' then
    insert into public.tank_token_transactions (user_id, amount, reason)
    values (p_user_id, v_final, p_source)
    returning id into v_txn_id;
  else
    update public.tank_profiles set xp = xp + v_final where user_id = p_user_id;
  end if;

  insert into public.tank_reward_events
    (user_id, currency, base_amount, click_bonus_applied, final_amount, source, source_id, shift_id, token_transaction_id, idempotency_key)
  values
    (p_user_id, p_currency, p_base_amount, v_bonus_applied, v_final, p_source, p_source_id, p_shift_id, v_txn_id, v_key)
  returning id into v_event_id;

  return jsonb_build_object(
    'success', true, 'alreadyGranted', false,
    'baseAmount', p_base_amount, 'clickBonusApplied', v_bonus_applied,
    'finalAmount', v_final, 'rewardEventId', v_event_id
  );
exception
  when unique_violation then
    select * into v_existing from public.tank_reward_events where idempotency_key = v_key;
    return jsonb_build_object(
      'success', true, 'alreadyGranted', true,
      'baseAmount', v_existing.base_amount, 'clickBonusApplied', v_existing.click_bonus_applied,
      'finalAmount', v_existing.final_amount, 'rewardEventId', v_existing.id
    );
end;
$$;
