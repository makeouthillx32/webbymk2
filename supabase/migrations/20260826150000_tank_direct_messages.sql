-- Tank Direct Messages (1:1 "Tank Messenger").
--
-- Reuses tank_chat_messages for storage rather than a parallel messages
-- table, mirroring the existing tank_clicks group-chat privacy pattern
-- exactly: a dm_id column + scope CHECK constraint routes dm:<id> rooms,
-- RLS restricts reads to the two participants, and tank_insert_chat_message
-- enforces membership server-side before any row is written. This keeps
-- history fetch, realtime, reactions, replies, and moderation all working
-- for DMs for free — they are just another room shape.

create table if not exists public.tank_dm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references auth.users(id) on delete cascade,
  user_b_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint tank_dm_conversations_ordered_pair check (user_a_id < user_b_id),
  constraint tank_dm_conversations_unique_pair unique (user_a_id, user_b_id)
);

alter table public.tank_dm_conversations enable row level security;

drop policy if exists "DM participants read their own conversations" on public.tank_dm_conversations;
create policy "DM participants read their own conversations"
  on public.tank_dm_conversations for select
  using (user_a_id = auth.uid() or user_b_id = auth.uid());

alter table public.tank_chat_messages
  add column if not exists dm_id uuid references public.tank_dm_conversations(id) on delete cascade;

create index if not exists tank_chat_messages_dm_id_idx
  on public.tank_chat_messages (dm_id, created_at);

alter table public.tank_chat_messages
  drop constraint if exists tank_chat_messages_click_scope_check;

alter table public.tank_chat_messages
  add constraint tank_chat_messages_scope_check check (
    (room_id <> 'director')
    and (
      (click_id is null and dm_id is null and room_id not like 'click:%' and room_id not like 'dm:%')
      or (dm_id is null and room_id = 'click:' || click_id)
      or (click_id is null and room_id = 'dm:' || dm_id)
    )
  );

-- Tighten the public-read policy so DM rows never fall through it — it
-- previously only excluded click_id rows, which would have made every
-- private message publicly readable the moment dm_id started getting set.
drop policy if exists "Public reads active Global and room chat" on public.tank_chat_messages;
create policy "Public reads active Global and room chat"
  on public.tank_chat_messages for select
  using (deleted_at is null and click_id is null and dm_id is null and room_id <> 'director');

drop policy if exists "DM participants read their conversation" on public.tank_chat_messages;
create policy "DM participants read their conversation"
  on public.tank_chat_messages for select
  using (
    deleted_at is null and dm_id is not null and exists (
      select 1 from public.tank_dm_conversations c
      where c.id = tank_chat_messages.dm_id
        and (c.user_a_id = auth.uid() or c.user_b_id = auth.uid())
    )
  );

-- Find-or-create a 1:1 conversation between the caller and another user,
-- canonically ordered so the same pair always resolves to one row.
create or replace function public.tank_get_or_create_dm(p_other_user_id uuid)
returns public.tank_dm_conversations
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_row public.tank_dm_conversations%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Sign in required to message another viewer.';
  end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'Choose another viewer to message.';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_other_user_id) then
    raise exception using errcode = '22023', message = 'That viewer no longer exists.';
  end if;

  if v_user_id < p_other_user_id then
    v_a := v_user_id; v_b := p_other_user_id;
  else
    v_a := p_other_user_id; v_b := v_user_id;
  end if;

  insert into public.tank_dm_conversations (user_a_id, user_b_id)
  values (v_a, v_b)
  on conflict (user_a_id, user_b_id) do nothing;

  select * into v_row from public.tank_dm_conversations
  where user_a_id = v_a and user_b_id = v_b;

  return v_row;
end;
$function$;

-- Extend the existing chat-insert RPC to also accept dm:<id> rooms, with
-- the same server-enforced membership check the click:<id> branch already
-- has. Everything else (slow mode, sub-only mode, reply scoping, nonce
-- dedupe) is unchanged and applies to DMs identically.
create or replace function public.tank_insert_chat_message(
  p_user_id uuid,
  p_room_id text,
  p_user_name text,
  p_user_role text,
  p_body text,
  p_client_nonce text default null::text,
  p_reply_to_message_id uuid default null::uuid
)
returns tank_chat_messages
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_state public.tank_chat_member_state%rowtype;
  v_message public.tank_chat_messages%rowtype;
  v_existing public.tank_chat_messages%rowtype;
  v_reply public.tank_chat_messages%rowtype;
  v_config jsonb := '{}'::jsonb;
  v_slow_seconds integer := 3;
  v_sub_only boolean := false;
  v_click_id uuid;
  v_dm_id uuid;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Authenticated user is required.';
  end if;
  if nullif(btrim(p_room_id), '') is null or length(p_room_id) > 64 or p_room_id = 'director' then
    raise exception using errcode = '22023', message = 'Invalid chat room.';
  end if;
  if p_room_id like 'click:%' then
    begin
      v_click_id := substring(p_room_id from 7)::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Invalid Click chat.';
    end;
    if not exists (
      select 1 from public.tank_click_members cm
      where cm.click_id = v_click_id and cm.user_id = p_user_id
    ) then
      raise exception using errcode = '42501', message = 'Click membership is required.';
    end if;
  end if;
  if p_room_id like 'dm:%' then
    begin
      v_dm_id := substring(p_room_id from 4)::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Invalid conversation.';
    end;
    if not exists (
      select 1 from public.tank_dm_conversations c
      where c.id = v_dm_id and (c.user_a_id = p_user_id or c.user_b_id = p_user_id)
    ) then
      raise exception using errcode = '42501', message = 'You are not part of this conversation.';
    end if;
  end if;
  if nullif(btrim(p_body), '') is null then
    raise exception using errcode = '22023', message = 'Message cannot be empty.';
  end if;
  if length(p_body) > 300 then
    raise exception using errcode = '22023', message = 'Message exceeds 300 characters.';
  end if;

  if p_client_nonce is not null then
    select * into v_existing from public.tank_chat_messages
    where user_id = p_user_id and client_nonce = left(p_client_nonce, 128) limit 1;
    if found then return v_existing; end if;
  end if;

  select value into v_config from public.tank_platform_settings where key = 'chat_automod_config';
  v_slow_seconds := greatest(0, least(60, coalesce((v_config ->> 'slowModeSeconds')::integer, 3)));
  v_sub_only := coalesce((v_config ->> 'subOnlyMode')::boolean, false);
  if v_sub_only and lower(coalesce(p_user_role, 'member')) not in ('vip', 'moderator', 'admin') then
    raise exception using errcode = '42501', message = 'Chat is temporarily limited to members with access.';
  end if;

  insert into public.tank_chat_member_state (user_id, last_message_at, updated_at)
  values (p_user_id, null, v_now) on conflict (user_id) do nothing;
  select * into v_state from public.tank_chat_member_state where user_id = p_user_id for update;
  if v_slow_seconds > 0 and v_state.last_message_at is not null
     and v_state.last_message_at > v_now - make_interval(secs => v_slow_seconds) then
    raise exception using errcode = 'P0001', message = format(
      'Slow mode is active. Wait %s second(s).',
      greatest(1, ceil(extract(epoch from (v_state.last_message_at + make_interval(secs => v_slow_seconds) - v_now)))::integer)
    );
  end if;

  if p_reply_to_message_id is not null then
    select * into v_reply from public.tank_chat_messages
    where id = p_reply_to_message_id and room_id = p_room_id and deleted_at is null;
    if not found then raise exception using errcode = '22023', message = 'Reply target is unavailable.'; end if;
  end if;

  insert into public.tank_chat_messages (
    room_id, click_id, dm_id, user_id, user_name, user_role, body, message_type,
    client_nonce, reply_to_message_id, reply_to_user_id
  ) values (
    p_room_id, v_click_id, v_dm_id, p_user_id,
    left(coalesce(nullif(btrim(p_user_name), ''), 'Member'), 80),
    case when lower(coalesce(p_user_role, 'member')) in ('viewer','member','regular','vip','moderator','admin')
      then lower(p_user_role) else 'member' end,
    btrim(p_body), 'text',
    case when p_client_nonce is null then null else left(p_client_nonce, 128) end,
    p_reply_to_message_id, v_reply.user_id
  ) returning * into v_message;

  update public.tank_chat_member_state set last_message_at = v_now, updated_at = v_now
  where user_id = p_user_id;

  if v_dm_id is not null then
    update public.tank_dm_conversations set last_message_at = v_now where id = v_dm_id;
  end if;

  return v_message;
exception when unique_violation then
  if p_client_nonce is null then raise; end if;
  select * into v_existing from public.tank_chat_messages
  where user_id = p_user_id and client_nonce = left(p_client_nonce, 128) limit 1;
  return v_existing;
end;
$function$;
