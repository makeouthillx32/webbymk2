-- Tank Tavern: fix a real gap found during Phase 1 verification. The mutiny-
-- closing step of private.tank_tavern_tick() compared overturn vs defend
-- counts but never checked the spec's quorum requirement ("a mutiny succeeds
-- when overturn beats defend AND reaches max(2, ceil(eligible viewers / 2))")
-- — eligible_count was declared on the table but never populated or used.
-- Proven live: a test mutiny with 0/0 votes closed as 'defended' instead of
-- being held open or handled by quorum logic, and eligible_count stayed null.
--
-- Eligible viewers = distinct present viewers on the Tank room, matching the
-- existing presence convention (tank_viewer_sessions, heartbeat-scoped,
-- viewer_key is identity — see Tank viewer presence note): distinct
-- viewer_key with last_seen_at within the last 90 seconds.

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

  -- 2. Close due mutinies. Quorum per spec: overturn must beat defend AND
  -- reach max(2, ceil(eligible viewers / 2)). eligible_count/overturn_count/
  -- defend_count are all persisted for the public aggregate snapshot.
  for v_mutiny in
    select * from public.tank_tavern_mutinies where status = 'open' and vote_deadline_at < now()
  loop
    declare
      v_overturn  integer;
      v_defend    integer;
      v_eligible  integer;
      v_quorum    integer;
      v_succeeds  boolean;
    begin
      select count(*) filter (where choice = 'overturn'), count(*) filter (where choice = 'defend')
      into v_overturn, v_defend
      from public.tank_tavern_mutiny_votes where mutiny_id = v_mutiny.id;

      select count(distinct viewer_key) into v_eligible
      from public.tank_viewer_sessions
      where last_seen_at >= now() - interval '90 seconds';

      v_quorum := greatest(2, ceil(coalesce(v_eligible, 0) / 2.0));
      v_succeeds := v_overturn > v_defend and v_overturn >= v_quorum;

      update public.tank_tavern_mutinies
      set status = case when v_succeeds then 'overturned' else 'defended' end,
          eligible_count = v_eligible, overturn_count = v_overturn, defend_count = v_defend
      where id = v_mutiny.id;

      if v_succeeds then
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
