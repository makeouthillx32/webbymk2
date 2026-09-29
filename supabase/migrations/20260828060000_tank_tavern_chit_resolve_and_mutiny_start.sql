-- Tank Tavern Phase 2: chit resolution + mutiny-start RPCs, plus a
-- tip_tokens column on chit templates (needed for chit reward math — not
-- present in the Phase 1 schema, added here now that it's actually needed).

alter table public.tank_tavern_chit_templates add column if not exists tip_tokens integer not null default 5;

update public.tank_tavern_chit_templates set tip_tokens = case
  when trouble_type is null then 5
  else 8  -- trouble chits pay more — matches them costing more chaos to ignore
end;

-- ── tank_resolve_tavern_chit: only the current Bartender may resolve ──────
-- Ordinary chits (trouble_type null): correct key is serve:<payload.item>.
-- Trouble chits: correct key is handle:<trouble_type>. One shot — any
-- resolve call (right or wrong) consumes the chit; a wrong guess is worse
-- for chaos than letting it expire naturally (expiry is a single +1 in
-- tick(); a wrong-served trouble chit is +3, an ordinary miss is +1).
create or replace function public.tank_resolve_tavern_chit(
  p_chit_id      uuid,
  p_response_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_chit         public.tank_tavern_chits;
  v_shift        public.tank_tavern_shifts;
  v_correct_key  text;
  v_success      boolean;
  v_chaos_delta  integer;
  v_reward       jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'sign in required');
  end if;

  select * into v_chit from public.tank_tavern_chits where id = p_chit_id for update;
  if v_chit.id is null then
    return jsonb_build_object('success', false, 'error', 'chit not found');
  end if;
  if v_chit.outcome <> 'pending' then
    return jsonb_build_object('success', false, 'error', 'chit already resolved');
  end if;
  if v_chit.deadline_at < now() then
    return jsonb_build_object('success', false, 'error', 'chit expired');
  end if;

  select * into v_shift from public.tank_tavern_shifts where id = v_chit.shift_id and status = 'active' for update;
  if v_shift.id is null then
    return jsonb_build_object('success', false, 'error', 'no active shift');
  end if;
  if v_shift.bartender_id <> v_user_id then
    return jsonb_build_object('success', false, 'error', 'only the Bartender can serve orders');
  end if;

  -- Correct key: trouble chits (template.trouble_type not null) expect
  -- handle:<trouble_type>; ordinary chits expect serve:<payload.item>.
  -- trouble_type isn't snapshotted onto the chit row itself, so read it off
  -- the template (immutable — templates are staff-authored and not deleted
  -- out from under live chits in normal operation).
  select case
    when t.trouble_type is not null then 'handle:' || t.trouble_type
    else 'serve:' || (v_chit.payload_snapshot ->> 'item')
  end
  into v_correct_key
  from public.tank_tavern_chit_templates t where t.id = v_chit.template_id;

  v_success := (v_correct_key is not null and p_response_key = v_correct_key);

  update public.tank_tavern_chits
  set outcome = 'served', resolved_by = v_user_id, resolved_at = now()
  where id = p_chit_id;

  if v_success then
    v_chaos_delta := case when v_correct_key like 'handle:%' then -3 else -1 end;
  else
    v_chaos_delta := case when v_correct_key like 'handle:%' then 3 else 1 end;
  end if;

  update public.tank_tavern_shifts
  set chaos = greatest(0, least(100, chaos + v_chaos_delta)),
      last_active_at = now(),
      tips_tokens = tips_tokens + case when v_success then
        (select tip_tokens from public.tank_tavern_chit_templates where id = v_chit.template_id) else 0 end
  where id = v_shift.id;

  if v_success then
    v_reward := public.tank_grant_reward(
      v_user_id,
      (select tip_tokens from public.tank_tavern_chit_templates where id = v_chit.template_id),
      'tokens', 'tavern_chit', p_chit_id, v_shift.id,
      'tavern_chit:' || p_chit_id::text
    );
  end if;

  return jsonb_build_object('success', true, 'outcome', case when v_success then 'served' else 'failed' end, 'reward', v_reward);
end;
$$;

revoke all on function public.tank_resolve_tavern_chit(uuid, text) from public, anon;
grant execute on function public.tank_resolve_tavern_chit(uuid, text) to authenticated;

-- ── tank_start_tavern_mutiny: initiator must be an active Click member and
-- not the current Bartender; DB-level partial unique index already stops a
-- second concurrent open mutiny on the same shift (caught below as a
-- friendly error instead of a raw constraint violation).
create or replace function public.tank_start_tavern_mutiny() returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_shift     public.tank_tavern_shifts;
  v_click_id  uuid;
  v_cfg       public.tank_tavern_config;
  v_mutiny_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'sign in required');
  end if;

  select * into v_shift from public.tank_tavern_shifts where status = 'active' limit 1;
  if v_shift.id is null then
    return jsonb_build_object('success', false, 'error', 'no active shift to mutiny against');
  end if;
  if v_shift.bartender_id = v_user_id then
    return jsonb_build_object('success', false, 'error', 'you cannot mutiny against yourself');
  end if;
  if exists (select 1 from public.tank_tavern_mutinies where shift_id = v_shift.id and status = 'open') then
    return jsonb_build_object('success', false, 'error', 'a mutiny is already in progress');
  end if;

  select click_id into v_click_id from public.tank_click_members where user_id = v_user_id limit 1;
  if v_click_id is null then
    return jsonb_build_object('success', false, 'error', 'you must belong to a Click to start a mutiny');
  end if;

  select * into v_cfg from public.tank_tavern_config limit 1;

  insert into public.tank_tavern_mutinies (shift_id, initiator_id, initiator_click_id, vote_deadline_at)
  values (v_shift.id, v_user_id, v_click_id, now() + make_interval(secs => coalesce(v_cfg.mutiny_vote_sec, 30)))
  returning id into v_mutiny_id;

  return jsonb_build_object('success', true, 'mutinyId', v_mutiny_id);
exception
  when unique_violation then
    return jsonb_build_object('success', false, 'error', 'a mutiny is already in progress');
end;
$$;

revoke all on function public.tank_start_tavern_mutiny() from public, anon;
grant execute on function public.tank_start_tavern_mutiny() to authenticated;
