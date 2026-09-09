-- Tank Tavern Phase 1 (part 2): private.tank_tavern_tick(), the Apron
-- Snatcher atomic transaction, and the pg_cron registration.
--
-- Advisory lock namespace: 872634501 (arbitrary, unique to this feature).
-- Subject key 1 = the single global Tavern lock (there is only ever one
-- Apron). First use of pg_advisory_xact_lock in this codebase — legitimate,
-- standard Postgres, just a new pattern here.

-- Dedicated idempotency column on the STOLEN (old) shift row — kept separate
-- from end_reason (a human-readable enum like 'deadline_reached') rather
-- than overloading it with an idempotency key string.
alter table public.tank_tavern_shifts add column if not exists takeover_idempotency_key text null;
create unique index if not exists tank_tavern_shifts_takeover_idem_uidx
  on public.tank_tavern_shifts (takeover_thief_id, takeover_idempotency_key)
  where takeover_idempotency_key is not null;

-- ── private.tank_tavern_tick(): service-only, runs every 10s ──────────────
create or replace function private.tank_tavern_tick() returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_cfg          public.tank_tavern_config;
  v_shift        public.tank_tavern_shifts;
  v_mutiny       public.tank_tavern_mutinies;
  v_queue_head   public.tank_tavern_queue;
  v_click_id     uuid;
  v_click_joined timestamptz;
  v_new_shift_id uuid;
  v_pending_ct   integer;
  v_template     public.tank_tavern_chit_templates;
begin
  perform pg_advisory_xact_lock(872634501, 1);

  select * into v_cfg from public.tank_tavern_config limit 1;
  if v_cfg is null then
    return; -- not configured yet, nothing to do
  end if;

  -- 1. Expire due chits — raises chaos, no reward.
  update public.tank_tavern_chits c
  set outcome = 'expired', resolved_at = now()
  from public.tank_tavern_shifts s
  where c.shift_id = s.id
    and c.outcome = 'pending'
    and c.deadline_at < now();

  update public.tank_tavern_shifts s
  set chaos = least(100, chaos + 1)
  where s.status = 'active'
    and exists (
      select 1 from public.tank_tavern_chits c
      where c.shift_id = s.id and c.outcome = 'expired' and c.resolved_at >= now() - interval '10 seconds'
    );

  -- 2. Close due mutinies.
  for v_mutiny in
    select * from public.tank_tavern_mutinies where status = 'open' and vote_deadline_at < now()
  loop
    declare
      v_overturn integer;
      v_defend   integer;
    begin
      select count(*) filter (where choice = 'overturn'), count(*) filter (where choice = 'defend')
      into v_overturn, v_defend
      from public.tank_tavern_mutiny_votes where mutiny_id = v_mutiny.id;

      update public.tank_tavern_mutinies
      set status = case when v_overturn > v_defend then 'overturned' else 'defended' end,
          overturn_count = v_overturn, defend_count = v_defend
      where id = v_mutiny.id;

      if v_overturn > v_defend then
        -- Oldest queued member of the initiating Click wins; else normal FIFO
        -- (handled by the promotion step below once this shift ends).
        update public.tank_tavern_shifts
        set status = 'rotated_out', end_reason = 'mutiny_overturned'
        where id = v_mutiny.shift_id and status = 'active';
      end if;
    end;
  end loop;

  -- 3. Finish shifts past deadline_at.
  update public.tank_tavern_shifts
  set status = 'completed', end_reason = 'deadline_reached'
  where status = 'active' and deadline_at < now();

  -- 4. Rotate Bartenders inactive 120s.
  update public.tank_tavern_shifts
  set status = 'rotated_out', end_reason = 'inactive_120s'
  where status = 'active' and last_active_at < now() - interval '120 seconds';

  -- 5. Promote the queue into any now-vacant Apron.
  if not exists (select 1 from public.tank_tavern_shifts where status = 'active') then
    -- A mutiny-overturn winner is the oldest queued member of the
    -- initiating Click; otherwise plain FIFO. Both cases reduce to "the
    -- oldest queue row matching the target Click, if any, else the oldest
    -- queue row overall" — compute once here.
    select q.* into v_queue_head
    from public.tank_tavern_queue q
    order by q.position asc
    limit 1;

    if v_queue_head.user_id is not null then
      select cm.click_id, cm.joined_at into v_click_id, v_click_joined
      from public.tank_click_members cm
      where cm.user_id = v_queue_head.user_id
      limit 1;

      insert into public.tank_tavern_shifts
        (bartender_id, bartender_click_id, bartender_click_joined_at, click_bonus_applies,
         deadline_at, chaos, sfx_allowance_remaining)
      values
        (v_queue_head.user_id, v_click_id, v_click_joined,
         (v_click_id is not null and v_click_joined < now()),
         now() + make_interval(mins => v_cfg.shift_minutes), 0, v_cfg.sfx_allowance_per_shift)
      returning id into v_new_shift_id;

      delete from public.tank_tavern_queue where id = v_queue_head.id;

      -- Renumber remaining queue rows to stay a dense FIFO sequence.
      with ranked as (
        select id, row_number() over (order by position asc) as rn
        from public.tank_tavern_queue
      )
      update public.tank_tavern_queue q set position = ranked.rn
      from ranked where ranked.id = q.id;
    end if;
  end if;

  -- 6. Generate new chits for the active shift, respecting max_pending_chits
  -- and the interval window. Weighted random pick via the Efraimidis-Spirakis
  -- trick (order by random()^(1/weight) desc), single row per tick.
  select * into v_shift from public.tank_tavern_shifts where status = 'active' limit 1;
  if v_shift.id is not null then
    select count(*) into v_pending_ct
    from public.tank_tavern_chits where shift_id = v_shift.id and outcome = 'pending';

    if v_pending_ct < v_cfg.max_pending_chits then
      select * into v_template
      from public.tank_tavern_chit_templates
      where is_active
      order by random() ^ (1.0 / weight) desc
      limit 1;

      if v_template.id is not null then
        insert into public.tank_tavern_chits
          (shift_id, template_id, dialogue_snapshot, payload_snapshot, deadline_at)
        values
          (v_shift.id, v_template.id, v_template.dialogue, v_template.payload,
           now() + make_interval(secs => v_cfg.chit_expiry_sec));
      end if;
    end if;
  end if;
end;
$$;

revoke all on function private.tank_tavern_tick() from public, anon, authenticated;
grant execute on function private.tank_tavern_tick() to service_role;

select cron.schedule('tank-tavern-tick', '10 seconds', $$select private.tank_tavern_tick();$$);

-- ── tank_use_apron_snatcher: the atomic takeover transaction ──────────────
-- MUST be called via the request-scoped client (auth.uid() derives the
-- caller) — never via the admin/service-role client, where auth.uid() is
-- NULL and this always fails closed. Ban/moderation-status gating is left to
-- the calling server action (tavernInventoryActions.ts), matching the
-- existing isUserBanned() JS-layer convention (sendChatMessage etc.) rather
-- than duplicating it here.
create or replace function public.tank_use_apron_snatcher(
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id       uuid := auth.uid();
  v_cfg           public.tank_tavern_config;
  v_shift         public.tank_tavern_shifts;
  v_item          public.tank_inventory_items;
  v_owned_qty     integer;
  v_click_id      uuid;
  v_click_joined  timestamptz;
  v_new_shift_id  uuid;
  v_profile       public.tank_profiles;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'sign in required');
  end if;

  perform pg_advisory_xact_lock(872634501, 1);

  -- Idempotent retry guard: a prior successful use with this exact
  -- (thief, key) pair already exists on the stolen (old) shift row — find
  -- its successor (the new shift created for that steal) and return that
  -- instead of stealing a second time / consuming a second copy.
  select s2.id into v_new_shift_id
  from public.tank_tavern_shifts s1
  join public.tank_tavern_shifts s2 on s2.predecessor_shift_id = s1.id
  where s1.takeover_thief_id = v_user_id and s1.takeover_idempotency_key = p_idempotency_key
  limit 1;
  if v_new_shift_id is not null then
    return jsonb_build_object('success', true, 'alreadyGranted', true, 'newShiftId', v_new_shift_id);
  end if;

  select * into v_cfg from public.tank_tavern_config limit 1;

  select * into v_profile from public.tank_profiles where user_id = v_user_id;
  if v_profile.user_id is null or coalesce(v_profile.email_verified, false) is not true
     or v_profile.display_name_confirmed_at is null then
    return jsonb_build_object('success', false, 'error', 'account not verified');
  end if;

  select * into v_item from public.tank_inventory_items where slug = 'apron-snatcher';
  select quantity into v_owned_qty
  from public.tank_player_inventory
  where user_id = v_user_id and item_id = v_item.id
  for update;
  if coalesce(v_owned_qty, 0) < 1 then
    return jsonb_build_object('success', false, 'error', 'no Apron Snatcher owned');
  end if;

  select * into v_shift from public.tank_tavern_shifts where status = 'active' for update;
  if v_shift.id is null then
    return jsonb_build_object('success', false, 'error', 'no active shift to steal');
  end if;
  if v_shift.bartender_id = v_user_id then
    return jsonb_build_object('success', false, 'error', 'you already hold the Apron');
  end if;
  if exists (select 1 from public.tank_tavern_mutinies where shift_id = v_shift.id and status = 'open') then
    return jsonb_build_object('success', false, 'error', 'a mutiny is in progress');
  end if;
  if v_shift.takeover_shielded_until is not null and v_shift.takeover_shielded_until > now() then
    return jsonb_build_object('success', false, 'error', 'this shift is still protected');
  end if;

  -- Consume exactly one copy.
  update public.tank_player_inventory
  set quantity = quantity - 1
  where user_id = v_user_id and item_id = v_item.id;
  delete from public.tank_player_inventory
  where user_id = v_user_id and item_id = v_item.id and quantity <= 0;

  -- Cancel unresolved chits from the stolen shift — no neglect penalty.
  update public.tank_tavern_chits
  set outcome = 'cancelled', resolved_at = now()
  where shift_id = v_shift.id and outcome = 'pending';

  -- End the old shift.
  update public.tank_tavern_shifts
  set status = 'stolen', end_reason = 'apron_snatched', takeover_idempotency_key = p_idempotency_key,
      takeover_thief_id = v_user_id, takeover_item_id = v_item.id
  where id = v_shift.id;

  -- Displaced Bartender is not auto-requeued; thief is removed from the
  -- queue if they were waiting (they're about to hold the Apron directly).
  delete from public.tank_tavern_queue where user_id = v_user_id;

  select cm.click_id, cm.joined_at into v_click_id, v_click_joined
  from public.tank_click_members cm where cm.user_id = v_user_id limit 1;

  insert into public.tank_tavern_shifts
    (bartender_id, bartender_click_id, bartender_click_joined_at, click_bonus_applies,
     deadline_at, chaos, sfx_allowance_remaining, predecessor_shift_id, takeover_shielded_until)
  values
    (v_user_id, v_click_id, v_click_joined, (v_click_id is not null and v_click_joined < now()),
     now() + make_interval(mins => coalesce(v_cfg.shift_minutes, 25)), 0,
     coalesce(v_cfg.sfx_allowance_per_shift, 5), v_shift.id,
     now() + make_interval(secs => coalesce(v_cfg.takeover_shield_sec, 60)))
  returning id into v_new_shift_id;

  -- Console message: no sender identity (user_id NULL, role 'system'), name
  -- goes in the body text — matches every other house_event in this
  -- codebase (see tank_chat_messages_console_has_no_sender CHECK constraint,
  -- caught live during Phase 1 verification — the first real test call
  -- failed this and correctly rolled back the whole transaction, item
  -- consumption included, proving atomicity in the process).
  insert into public.tank_chat_messages (room_id, user_id, user_name, user_role, body, message_type, metadata)
  values (
    'global', null, 'SYSTEM', 'system',
    coalesce(v_profile.display_name, 'A viewer') || ' snatched the Apron! A new shift begins.',
    'house_event',
    jsonb_build_object('tavern_event', 'takeover', 'shift_id', v_new_shift_id, 'stolen_from_shift_id', v_shift.id, 'thief_id', v_user_id)
  );

  return jsonb_build_object('success', true, 'alreadyGranted', false, 'newShiftId', v_new_shift_id, 'stolenFromUserId', v_shift.bartender_id);
end;
$$;

revoke all on function public.tank_use_apron_snatcher(text) from public, anon;
grant execute on function public.tank_use_apron_snatcher(text) to authenticated;
