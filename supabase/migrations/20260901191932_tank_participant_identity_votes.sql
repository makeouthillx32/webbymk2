-- Durable Tank participation identity and atomic one-vote-per-participant
-- enforcement. Browser clients never access this ledger directly; Tank's
-- validated server action calls the service-role-only RPC.

create table if not exists public.tank_poll_votes (
  poll_id text not null,
  voter_key text not null,
  voter_kind text not null,
  option_index integer not null,
  created_at timestamptz not null default now(),
  constraint tank_poll_votes_pkey primary key (poll_id, voter_key),
  constraint tank_poll_votes_poll_id_check
    check (length(poll_id) between 3 and 96),
  constraint tank_poll_votes_voter_key_check
    check (length(voter_key) between 3 and 64),
  constraint tank_poll_votes_voter_kind_check
    check (voter_kind in ('member', 'guest', 'legacy_guest')),
  constraint tank_poll_votes_option_index_check
    check (option_index >= 0)
);

alter table public.tank_poll_votes enable row level security;
alter table public.tank_poll_votes force row level security;
revoke all on table public.tank_poll_votes from public, anon, authenticated;
grant select, insert on table public.tank_poll_votes to service_role;

comment on table public.tank_poll_votes is
  'Private Tank poll integrity ledger. One row per poll and server-resolved participant.';

-- Preserve the active poll's existing duplicate-vote protection when the
-- ledger is introduced. Old anonymous keys remain valid historical entries;
-- new votes use signed guest keys or authenticated account UUIDs.
insert into public.tank_poll_votes (
  poll_id,
  voter_key,
  voter_kind,
  option_index
)
select
  settings.value ->> 'id',
  existing_vote.key,
  case
    when existing_vote.key ~ '^[0-9a-fA-F-]{36}$' then 'member'
    else 'legacy_guest'
  end,
  (existing_vote.value #>> '{}')::integer
from public.tank_platform_settings as settings
cross join lateral jsonb_each(
  coalesce(settings.value -> 'votedUserIds', '{}'::jsonb)
) as existing_vote
where settings.key = 'tank_active_poll_v1'
  and settings.value ->> 'id' is not null
  and jsonb_typeof(existing_vote.value) = 'number'
on conflict (poll_id, voter_key) do nothing;

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
  v_voter_kind text;
  v_inserted boolean;
begin
  if p_poll_id is null
     or length(p_poll_id) < 3
     or length(p_poll_id) > 96
     or p_voter_key is null
     or length(p_voter_key) < 3
     or length(p_voter_key) > 64
     or p_voter_key !~ '^([0-9a-fA-F-]{36}|guest_[0-9a-fA-F-]{36}|anon_c_[A-Za-z0-9]+_[A-Za-z0-9]+)$'
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

  if v_poll -> 'options' -> p_option_index is null then
    raise exception using errcode = '22023', message = 'Invalid option selected.';
  end if;

  v_voter_kind := case
    when p_voter_key like 'guest\_%' escape '\' then 'guest'
    when p_voter_key like 'anon\_c\_%' escape '\' then 'legacy_guest'
    else 'member'
  end;

  if coalesce(v_poll ->> 'voterEligibility', 'everyone') = 'members'
     and v_voter_kind <> 'member' then
    raise exception using errcode = '42501', message = 'Sign in with a verified member account to vote in this poll.';
  end if;

  insert into public.tank_poll_votes (
    poll_id,
    voter_key,
    voter_kind,
    option_index
  ) values (
    p_poll_id,
    p_voter_key,
    v_voter_kind,
    p_option_index
  )
  on conflict (poll_id, voter_key) do nothing
  returning true into v_inserted;

  if coalesce(v_inserted, false) is false then
    raise exception using errcode = '23505', message = 'You have already voted in this poll.';
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
