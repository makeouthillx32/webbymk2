-- Tank launch day 2: make daily missions truly daily and refresh the public poll.
-- Mission progress used to be unique for the lifetime of an account, so a
-- completed mission could never return on a later day.

alter table public.tank_mission_progress
  add column if not exists mission_day date;

update public.tank_mission_progress
set mission_day = (coalesce(completed_at, now()) at time zone 'UTC')::date
where mission_day is null;

alter table public.tank_mission_progress
  alter column mission_day set default ((now() at time zone 'UTC')::date),
  alter column mission_day set not null;

alter table public.tank_mission_progress
  drop constraint if exists tank_mission_progress_pkey;

alter table public.tank_mission_progress
  add constraint tank_mission_progress_pkey
  primary key (mission_id, user_id, mission_day);

create index if not exists tank_mission_progress_user_day_idx
  on public.tank_mission_progress (user_id, mission_day);

create or replace function public.tank_record_mission_progress(
  p_user_id uuid,
  p_mission_key text,
  p_increment integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mission public.tank_missions%rowtype;
  v_progress_row public.tank_mission_progress%rowtype;
  v_day date := (now() at time zone 'UTC')::date;
  v_was_completed boolean := false;
  v_just_completed boolean := false;
begin
  if p_increment <= 0 then
    return jsonb_build_object('success', false, 'error', 'Increment must be positive');
  end if;

  select * into v_mission
  from public.tank_missions
  where key = p_mission_key and is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Mission not found or inactive');
  end if;

  select completed_at is not null into v_was_completed
  from public.tank_mission_progress
  where mission_id = v_mission.id
    and user_id = p_user_id
    and mission_day = v_day
  for update;

  v_was_completed := coalesce(v_was_completed, false);

  insert into public.tank_mission_progress
    (mission_id, user_id, mission_day, progress, completed_at)
  values (
    v_mission.id,
    p_user_id,
    v_day,
    least(v_mission.target_count, p_increment),
    case when p_increment >= v_mission.target_count then now() else null end
  )
  on conflict (mission_id, user_id, mission_day) do update
  set progress = least(
        v_mission.target_count,
        public.tank_mission_progress.progress + excluded.progress
      ),
      completed_at = case
        when public.tank_mission_progress.completed_at is not null
          then public.tank_mission_progress.completed_at
        when public.tank_mission_progress.progress + excluded.progress >= v_mission.target_count
          then now()
        else null
      end
  returning * into v_progress_row;

  v_just_completed := not v_was_completed and v_progress_row.completed_at is not null;

  if v_just_completed and v_mission.reward_tokens > 0 then
    perform public.tank_grant_reward(
      p_user_id,
      v_mission.reward_tokens,
      'tokens',
      'daily_mission',
      v_mission.id,
      null,
      format('daily-mission:%s:%s:tokens', v_day, v_mission.id)
    );
  end if;

  if v_just_completed and v_mission.reward_xp > 0 then
    perform public.tank_grant_reward(
      p_user_id,
      v_mission.reward_xp,
      'xp',
      'daily_mission',
      v_mission.id,
      null,
      format('daily-mission:%s:%s:xp', v_day, v_mission.id)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'missionKey', v_mission.key,
    'missionDay', v_day,
    'progress', v_progress_row.progress,
    'target', v_mission.target_count,
    'completed', v_progress_row.completed_at is not null,
    'justCompleted', v_just_completed,
    'rewardTokens', v_mission.reward_tokens,
    'rewardXp', v_mission.reward_xp
  );
end;
$$;

revoke all on function public.tank_record_mission_progress(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.tank_record_mission_progress(uuid, text, integer)
  to service_role;

-- Refresh launch-facing copy and add one fully wired mission. These keys stay
-- stable so existing event producers do not depend on display wording.
update public.tank_missions
set title = case key
      when 'sign_in_first_time' then 'Check In to Tank'
      when 'watch_live_camera' then 'Watch a Live Room'
      when 'post_first_message' then 'Join the Live Chat'
      when 'type_t_20_times' then 'Twenty Ts for Tank'
      when 'roll_luck_game' then 'Play a Chat Game'
      when 'use_first_item' then 'Use an Inventory Item'
      when 'find_scavenger_target' then 'Spot a House Target'
      else title
    end,
    description = case key
      when 'sign_in_first_time' then 'Open Tank while signed in today.'
      when 'watch_live_camera' then 'Watch any live house room today.'
      when 'post_first_message' then 'Send a message in Tank live chat today.'
      when 'type_t_20_times' then 'Send messages containing 20 total letter Ts today.'
      when 'roll_luck_game' then 'Play /roll, /flip, /slots, /unbox, or /roulette today.'
      when 'use_first_item' then 'Activate any consumable item or gadget today.'
      when 'find_scavenger_target' then 'Spot and tap an interactive target on a live camera today.'
      else description
    end
where key in (
  'sign_in_first_time',
  'watch_live_camera',
  'post_first_message',
  'type_t_20_times',
  'roll_luck_game',
  'use_first_item',
  'find_scavenger_target'
);

insert into public.tank_missions
  (key, category, title, description, reward_tokens, reward_xp, target_count, sort_order, is_active)
values
  ('vote_house_poll', 'community', 'Vote in the House Poll',
   'Cast one vote in the active House Poll today.', 15, 40, 1, 8, true)
on conflict (key) do update
set category = excluded.category,
    title = excluded.title,
    description = excluded.description,
    reward_tokens = excluded.reward_tokens,
    reward_xp = excluded.reward_xp,
    target_count = excluded.target_count,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

-- Preserve any staff-created active poll. Only replace the original August
-- seed (or create the setting if it is absent).
insert into public.tank_platform_settings (key, value, updated_at)
values (
  'tank_active_poll_v1',
  jsonb_build_object(
    'id', 'poll_launch_day_2_20260913',
    'question', 'What should Tank add during launch week?',
    'options', jsonb_build_array(
      jsonb_build_object('id', 0, 'text', 'More live house challenges', 'votes', 0),
      jsonb_build_object('id', 1, 'text', 'More viewer-controlled items', 'votes', 0),
      jsonb_build_object('id', 2, 'text', 'Better daily missions', 'votes', 0),
      jsonb_build_object('id', 3, 'text', 'More camera angles', 'votes', 0),
      jsonb_build_object('id', 4, 'text', 'More chat games', 'votes', 0)
    ),
    'totalVotes', 0,
    'votedUserIds', '{}'::jsonb,
    'createdAt', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'expiresAt', null,
    'durationMinutes', 'indefinite',
    'createdBy', 'Tank House',
    'active', true,
    'voterEligibility', 'everyone'
  ),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at
where public.tank_platform_settings.value ->> 'id' = 'poll_tank_direction_20260824';
