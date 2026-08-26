-- Tank polls accept signed-in UUIDs and stable anonymous browser keys.
-- The previous UUID-only signature made every genuine guest vote fail before
-- the function body ran. Keep the RPC service-role-only; the public client
-- reaches it through Tank's validated server action.
drop function if exists public.tank_cast_poll_vote(text, uuid, integer);

create or replace function public.tank_cast_poll_vote(
  p_poll_id text,
  p_voter_key text,
  p_option_index integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_poll jsonb;
  v_votes integer;
  v_total integer;
begin
  if p_voter_key is null
     or length(p_voter_key) < 3
     or length(p_voter_key) > 64
     or p_voter_key !~ '^(anon_c_[A-Za-z0-9]+_[A-Za-z0-9]+|[0-9a-fA-F-]{36})$'
     or p_option_index < 0 then
    raise exception using errcode = '22023', message = 'Invalid vote.';
  end if;

  select value into v_poll
  from public.tank_platform_settings
  where key = 'tank_active_poll_v1'
  for update;

  if v_poll is null
     or coalesce((v_poll ->> 'active')::boolean, false) is false
     or v_poll ->> 'id' <> p_poll_id then
    raise exception using errcode = 'P0001', message = 'Poll has ended or expired.';
  end if;

  if (v_poll ->> 'expiresAt') is not null
     and (v_poll ->> 'expiresAt')::bigint
       < (extract(epoch from clock_timestamp()) * 1000)::bigint then
    raise exception using errcode = 'P0001', message = 'Poll has expired.';
  end if;

  if coalesce(v_poll -> 'votedUserIds', '{}'::jsonb) ? p_voter_key then
    raise exception using errcode = '23505', message = 'You have already voted in this poll.';
  end if;

  if v_poll -> 'options' -> p_option_index is null then
    raise exception using errcode = '22023', message = 'Invalid option selected.';
  end if;

  v_votes := coalesce(
    (v_poll -> 'options' -> p_option_index ->> 'votes')::integer,
    0
  ) + 1;
  v_total := coalesce((v_poll ->> 'totalVotes')::integer, 0) + 1;
  v_poll := jsonb_set(
    v_poll,
    array['options', p_option_index::text, 'votes'],
    to_jsonb(v_votes),
    false
  );
  v_poll := jsonb_set(v_poll, '{totalVotes}', to_jsonb(v_total), true);
  v_poll := jsonb_set(
    v_poll,
    array['votedUserIds', p_voter_key],
    to_jsonb(p_option_index),
    true
  );

  update public.tank_platform_settings
  set value = v_poll, updated_at = now()
  where key = 'tank_active_poll_v1';

  return v_poll;
end;
$$;

revoke all on function public.tank_cast_poll_vote(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.tank_cast_poll_vote(text, text, integer)
  to service_role;

-- Seed the first public product-direction poll only when no live poll exists.
-- Staff-created live polls always win and are never overwritten by migration.
insert into public.tank_platform_settings (key, value, updated_at)
values (
  'tank_active_poll_v1',
  jsonb_build_object(
    'id', 'poll_tank_direction_20260824',
    'question', 'What should Tank improve next?',
    'options', jsonb_build_array(
      jsonb_build_object('id', 0, 'text', 'Better director tracking', 'votes', 0),
      jsonb_build_object('id', 1, 'text', 'More chat games', 'votes', 0),
      jsonb_build_object('id', 2, 'text', 'Real-world interactive effects', 'votes', 0),
      jsonb_build_object('id', 3, 'text', 'More Tank events', 'votes', 0),
      jsonb_build_object('id', 4, 'text', 'More XP and rewards', 'votes', 0)
    ),
    'totalVotes', 0,
    'votedUserIds', '{}'::jsonb,
    'createdAt', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'expiresAt', null,
    'durationMinutes', 'indefinite',
    'createdBy', 'HOUSE',
    'active', true
  ),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at
where coalesce(
        (public.tank_platform_settings.value ->> 'active')::boolean,
        false
      ) is false
   or (
        (public.tank_platform_settings.value ->> 'expiresAt') is not null
        and (public.tank_platform_settings.value ->> 'expiresAt')::bigint
          < (extract(epoch from clock_timestamp()) * 1000)::bigint
      );
