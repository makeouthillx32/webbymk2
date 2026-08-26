begin;

-- Tank chat foundation: durable real-user chat plus senderless house events.
-- Automated work is deliberately represented as system/house_event rows,
-- never as a user, profile, role, avatar, or conversational persona.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- --------------------------------------------------------------------------
-- Message integrity, replies, idempotency, and moderation audit columns
-- --------------------------------------------------------------------------

alter table public.tank_chat_messages
  add column if not exists client_nonce text,
  add column if not exists reply_to_message_id uuid,
  add column if not exists reply_to_user_id uuid,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tank_chat_messages_reply_to_message_id_fkey'
      and conrelid = 'public.tank_chat_messages'::regclass
  ) then
    alter table public.tank_chat_messages
      add constraint tank_chat_messages_reply_to_message_id_fkey
      foreign key (reply_to_message_id)
      references public.tank_chat_messages(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tank_chat_messages_reply_to_user_id_fkey'
      and conrelid = 'public.tank_chat_messages'::regclass
  ) then
    alter table public.tank_chat_messages
      add constraint tank_chat_messages_reply_to_user_id_fkey
      foreign key (reply_to_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end
$$;

create unique index if not exists tank_chat_messages_user_nonce_uidx
  on public.tank_chat_messages (user_id, client_nonce)
  where user_id is not null and client_nonce is not null;

create index if not exists tank_chat_messages_room_active_created_idx
  on public.tank_chat_messages (room_id, created_at desc)
  where deleted_at is null;

create index if not exists tank_chat_messages_reply_idx
  on public.tank_chat_messages (reply_to_message_id)
  where reply_to_message_id is not null;

-- Direct browser writes are removed. The stable Tank API performs auth,
-- automod, slow-mode, reply validation, and the insert as one server path.
drop policy if exists "Public can view chat messages" on public.tank_chat_messages;
drop policy if exists "Public can read chat messages" on public.tank_chat_messages;
drop policy if exists "Authenticated users can insert chat messages" on public.tank_chat_messages;
drop policy if exists "Authenticated users can post their own chat messages" on public.tank_chat_messages;
drop policy if exists "Admins have full access to chat messages" on public.tank_chat_messages;
drop policy if exists "Admins and service role manage chat messages" on public.tank_chat_messages;

create policy "Public reads active Tank chat"
  on public.tank_chat_messages
  for select
  to anon, authenticated
  using (deleted_at is null);

revoke insert, update, delete on public.tank_chat_messages from anon, authenticated;
grant select on public.tank_chat_messages to anon, authenticated;

-- --------------------------------------------------------------------------
-- Atomic server-only message insertion and slow-mode state
-- --------------------------------------------------------------------------

create table if not exists public.tank_chat_member_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_message_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.tank_chat_member_state enable row level security;
revoke all on public.tank_chat_member_state from public, anon, authenticated;

create or replace function public.tank_insert_chat_message(
  p_user_id uuid,
  p_room_id text,
  p_user_name text,
  p_user_role text,
  p_body text,
  p_client_nonce text default null,
  p_reply_to_message_id uuid default null
)
returns public.tank_chat_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_state public.tank_chat_member_state%rowtype;
  v_message public.tank_chat_messages%rowtype;
  v_existing public.tank_chat_messages%rowtype;
  v_reply public.tank_chat_messages%rowtype;
  v_config jsonb := '{}'::jsonb;
  v_slow_seconds integer := 3;
  v_sub_only boolean := false;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Authenticated user is required.';
  end if;
  if nullif(btrim(p_room_id), '') is null or length(p_room_id) > 64 then
    raise exception using errcode = '22023', message = 'Invalid chat room.';
  end if;
  if nullif(btrim(p_body), '') is null then
    raise exception using errcode = '22023', message = 'Message cannot be empty.';
  end if;
  if length(p_body) > 300 then
    raise exception using errcode = '22023', message = 'Message exceeds 300 characters.';
  end if;

  if p_client_nonce is not null then
    select * into v_existing
    from public.tank_chat_messages
    where user_id = p_user_id and client_nonce = left(p_client_nonce, 128)
    limit 1;
    if found then
      return v_existing;
    end if;
  end if;

  select value into v_config
  from public.tank_platform_settings
  where key = 'chat_automod_config';

  v_slow_seconds := greatest(0, least(60, coalesce((v_config ->> 'slowModeSeconds')::integer, 3)));
  v_sub_only := coalesce((v_config ->> 'subOnlyMode')::boolean, false);

  if v_sub_only and lower(coalesce(p_user_role, 'member')) not in ('vip', 'moderator', 'admin') then
    raise exception using errcode = '42501', message = 'Chat is temporarily limited to members with access.';
  end if;

  insert into public.tank_chat_member_state (user_id, last_message_at, updated_at)
  values (p_user_id, null, v_now)
  on conflict (user_id) do nothing;

  select * into v_state
  from public.tank_chat_member_state
  where user_id = p_user_id
  for update;

  if v_slow_seconds > 0
     and v_state.last_message_at is not null
     and v_state.last_message_at > v_now - make_interval(secs => v_slow_seconds)
  then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Slow mode is active. Wait %s second(s).',
        greatest(1, ceil(extract(epoch from (v_state.last_message_at + make_interval(secs => v_slow_seconds) - v_now)))::integer)
      );
  end if;

  if p_reply_to_message_id is not null then
    select * into v_reply
    from public.tank_chat_messages
    where id = p_reply_to_message_id
      and room_id = p_room_id
      and deleted_at is null;
    if not found then
      raise exception using errcode = '22023', message = 'Reply target is unavailable.';
    end if;
  end if;

  insert into public.tank_chat_messages (
    room_id,
    user_id,
    user_name,
    user_role,
    body,
    message_type,
    client_nonce,
    reply_to_message_id,
    reply_to_user_id
  ) values (
    p_room_id,
    p_user_id,
    left(coalesce(nullif(btrim(p_user_name), ''), 'Member'), 80),
    case when lower(coalesce(p_user_role, 'member')) in ('viewer','member','regular','vip','moderator','admin')
      then lower(p_user_role) else 'member' end,
    btrim(p_body),
    'text',
    case when p_client_nonce is null then null else left(p_client_nonce, 128) end,
    p_reply_to_message_id,
    v_reply.user_id
  )
  returning * into v_message;

  update public.tank_chat_member_state
  set last_message_at = v_now, updated_at = v_now
  where user_id = p_user_id;

  return v_message;
exception
  when unique_violation then
    if p_client_nonce is null then
      raise;
    end if;
    select * into v_existing
    from public.tank_chat_messages
    where user_id = p_user_id and client_nonce = left(p_client_nonce, 128)
    limit 1;
    return v_existing;
end;
$$;

revoke all on function public.tank_insert_chat_message(uuid,text,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.tank_insert_chat_message(uuid,text,text,text,text,text,uuid) to service_role;

-- A real user message earns XP in exactly one place: this trigger. Console and
-- house-event rows have no sender and never earn progression.
create or replace function public.handle_tank_chat_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null or coalesce(new.message_type, 'text') not in ('chat', 'text') then
    return new;
  end if;

  insert into public.tank_profiles (user_id, display_name, xp, level, tokens)
  values (new.user_id, new.user_name, 5, 1, 0)
  on conflict (user_id) do update
    set xp = public.tank_profiles.xp + 5,
        updated_at = now();

  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- Real-user reactions and per-room read state
-- --------------------------------------------------------------------------

create table if not exists public.tank_chat_reactions (
  message_id uuid not null references public.tank_chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('love','laugh','wow','fish','fire','skull')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, reaction)
);

create index if not exists tank_chat_reactions_message_idx
  on public.tank_chat_reactions (message_id, created_at);

alter table public.tank_chat_reactions enable row level security;

drop policy if exists "Public reads Tank chat reactions" on public.tank_chat_reactions;
drop policy if exists "Members add their Tank chat reactions" on public.tank_chat_reactions;
drop policy if exists "Members remove their Tank chat reactions" on public.tank_chat_reactions;

create policy "Public reads Tank chat reactions"
  on public.tank_chat_reactions for select
  to anon, authenticated
  using (true);

create policy "Members add their Tank chat reactions"
  on public.tank_chat_reactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.tank_chat_messages m
      where m.id = message_id and m.deleted_at is null
    )
  );

create policy "Members remove their Tank chat reactions"
  on public.tank_chat_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on public.tank_chat_reactions to anon, authenticated;
grant insert, delete on public.tank_chat_reactions to authenticated;

create table if not exists public.tank_chat_read_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id text not null,
  last_read_message_id uuid references public.tank_chat_messages(id) on delete set null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, room_id)
);

alter table public.tank_chat_read_state enable row level security;

drop policy if exists "Members manage their Tank chat read state" on public.tank_chat_read_state;
create policy "Members manage their Tank chat read state"
  on public.tank_chat_read_state for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.tank_chat_read_state to authenticated;

-- --------------------------------------------------------------------------
-- Durable scheduled house events: functions and cron, never fake users
-- --------------------------------------------------------------------------

create table if not exists public.tank_house_events (
  id uuid primary key default gen_random_uuid(),
  room_id text not null default 'global',
  event_type text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'scheduled'
    check (status in ('scheduled','publishing','published','cancelled','failed')),
  execute_at timestamptz not null default now(),
  published_message_id uuid references public.tank_chat_messages(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  idempotency_key text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tank_house_events_idempotency_uidx
  on public.tank_house_events (idempotency_key)
  where idempotency_key is not null;

create index if not exists tank_house_events_due_idx
  on public.tank_house_events (execute_at, id)
  where status = 'scheduled';

alter table public.tank_house_events enable row level security;
revoke all on public.tank_house_events from public, anon, authenticated;

create or replace function private.tank_publish_due_house_events(p_limit integer default 25)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.tank_house_events%rowtype;
  v_message_id uuid;
  v_count integer := 0;
begin
  for v_event in
    select *
    from public.tank_house_events
    where status = 'scheduled' and execute_at <= now()
    order by execute_at, id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  loop
    begin
      update public.tank_house_events
      set status = 'publishing', attempts = attempts + 1, updated_at = now()
      where id = v_event.id;

      insert into public.tank_chat_messages (
        room_id, user_id, user_name, user_role, body, message_type, metadata
      ) values (
        v_event.room_id,
        null,
        'HOUSE',
        'system',
        v_event.body,
        case when v_event.event_type in ('system','announcement','trivia','scavenger')
          then v_event.event_type else 'house_event' end,
        coalesce(v_event.payload, '{}'::jsonb) || jsonb_build_object('houseEventId', v_event.id)
      ) returning id into v_message_id;

      update public.tank_house_events
      set status = 'published', published_message_id = v_message_id,
          last_error = null, updated_at = now()
      where id = v_event.id;
      v_count := v_count + 1;
    exception when others then
      update public.tank_house_events
      set status = case when attempts >= 4 then 'failed' else 'scheduled' end,
          last_error = left(sqlerrm, 500),
          execute_at = now() + interval '1 minute',
          updated_at = now()
      where id = v_event.id;
    end;
  end loop;

  delete from public.tank_viewer_sessions
  where last_seen_at < now() - interval '24 hours';

  return v_count;
end;
$$;

revoke all on function private.tank_publish_due_house_events(integer) from public, anon, authenticated;
grant execute on function private.tank_publish_due_house_events(integer) to service_role;

-- Public presence counts real people only. Automated clients remain visible to
-- staff as a separate operational signal but never inflate the audience.
create or replace function public.tank_human_presence_snapshot(p_ttl_seconds integer default 45)
returns table (
  online bigint,
  members bigint,
  anonymous bigint,
  automated bigint,
  on_cellular bigint,
  shared_connections bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select *
    from public.tank_viewer_sessions
    where last_seen_at >= now() - make_interval(secs => greatest(5, least(p_ttl_seconds, 300)))
  ), shared as (
    select ip_hash
    from live
    where client_kind = 'human' and ip_hash is not null
    group by ip_hash
    having count(*) > 1
  )
  select
    count(*) filter (where client_kind = 'human'),
    count(*) filter (where client_kind = 'human' and user_id is not null),
    count(*) filter (where client_kind = 'human' and user_id is null),
    count(*) filter (where client_kind = 'bot'),
    count(*) filter (where client_kind = 'human' and connection_type = 'cellular'),
    (select count(*) from shared)
  from live;
$$;

revoke all on function public.tank_human_presence_snapshot(integer) from public, anon, authenticated;
grant execute on function public.tank_human_presence_snapshot(integer) to service_role;

-- Poll votes remain compatible with the existing JSON shape, but the read,
-- duplicate check, increment, and write now occur under one row lock.
create or replace function public.tank_cast_poll_vote(
  p_poll_id text,
  p_user_id uuid,
  p_option_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll jsonb;
  v_votes integer;
  v_total integer;
begin
  if p_user_id is null or p_option_index < 0 then
    raise exception using errcode = '22023', message = 'Invalid vote.';
  end if;
  select value into v_poll
  from public.tank_platform_settings
  where key = 'tank_active_poll_v1'
  for update;
  if v_poll is null or coalesce((v_poll ->> 'active')::boolean, false) is false
     or v_poll ->> 'id' <> p_poll_id then
    raise exception using errcode = 'P0001', message = 'Poll has ended or expired.';
  end if;
  if (v_poll ->> 'expiresAt') is not null
     and (v_poll ->> 'expiresAt')::bigint < (extract(epoch from clock_timestamp()) * 1000)::bigint then
    raise exception using errcode = 'P0001', message = 'Poll has expired.';
  end if;
  if coalesce(v_poll -> 'votedUserIds', '{}'::jsonb) ? p_user_id::text then
    raise exception using errcode = '23505', message = 'You have already voted in this poll.';
  end if;
  if v_poll -> 'options' -> p_option_index is null then
    raise exception using errcode = '22023', message = 'Invalid option selected.';
  end if;
  v_votes := coalesce((v_poll -> 'options' -> p_option_index ->> 'votes')::integer, 0) + 1;
  v_total := coalesce((v_poll ->> 'totalVotes')::integer, 0) + 1;
  v_poll := jsonb_set(v_poll, array['options', p_option_index::text, 'votes'], to_jsonb(v_votes), false);
  v_poll := jsonb_set(v_poll, '{totalVotes}', to_jsonb(v_total), true);
  v_poll := jsonb_set(v_poll, array['votedUserIds', p_user_id::text], to_jsonb(p_option_index), true);
  update public.tank_platform_settings
  set value = v_poll, updated_at = now()
  where key = 'tank_active_poll_v1';
  return v_poll;
end;
$$;

revoke all on function public.tank_cast_poll_vote(text,uuid,integer) from public, anon, authenticated;
grant execute on function public.tank_cast_poll_vote(text,uuid,integer) to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'tank-house-events';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'tank-house-events',
    '* * * * *',
    'select private.tank_publish_due_house_events(25);'
  );
end
$$;

-- --------------------------------------------------------------------------
-- Least privilege for exposed SECURITY DEFINER reward/item RPCs
-- --------------------------------------------------------------------------

revoke all on function public.tank_apply_balance_delta(uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.tank_apply_balance_delta(uuid,integer,integer)
  to service_role;

revoke all on function public.tank_use_inventory_item(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.tank_use_inventory_item(uuid,text,text)
  to service_role;

-- Public platform settings previously exposed future ban lists and member
-- identifiers. Only the explicit visitor-safe switches remain readable.
drop policy if exists "Public can view platform settings" on public.tank_platform_settings;
drop policy if exists "Public can read platform settings" on public.tank_platform_settings;

create policy "Public reads safe Tank settings"
  on public.tank_platform_settings for select
  to anon, authenticated
  using (key in ('launch_mode', 'sfx_enabled', 'tts_enabled'));

commit;
