-- Canonical Tank social-group naming and private Click chat enforcement.
-- Existing UUIDs and rows survive the rename.

alter table public.tank_clans rename to tank_clicks;
alter table public.tank_clan_members rename to tank_click_members;
alter table public.tank_click_members rename column clan_id to click_id;

alter table public.tank_chat_messages
  add column if not exists click_id uuid references public.tank_clicks(id) on delete cascade;

-- Director is a program feed, never a chat scope. Preserve its old history in Global.
update public.tank_chat_messages set room_id = 'global' where room_id = 'director';

alter table public.tank_chat_messages
  add constraint tank_chat_messages_click_scope_check
  check (
    room_id <> 'director'
    and (
      (click_id is null and room_id not like 'click:%')
      or room_id = 'click:' || click_id::text
    )
  );

create index if not exists tank_chat_messages_click_recent_idx
  on public.tank_chat_messages (click_id, created_at desc)
  where click_id is not null and deleted_at is null;

create index if not exists tank_click_members_user_idx
  on public.tank_click_members (user_id, click_id);

drop policy if exists "Public can read clan membership" on public.tank_click_members;
drop policy if exists "Members can join a clan for themselves" on public.tank_click_members;
drop policy if exists "Members can leave their own clan" on public.tank_click_members;
drop policy if exists "Admins and service role manage clan membership" on public.tank_click_members;
drop policy if exists "Public can read clans" on public.tank_clicks;
drop policy if exists "Admins and service role manage clans" on public.tank_clicks;

create policy "Public can discover Clicks"
  on public.tank_clicks for select to anon, authenticated using (true);
create policy "Admins manage Clicks"
  on public.tank_clicks for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Membership is private. Roster presentation is assembled by trusted server code.
create policy "Members read their own Click membership"
  on public.tank_click_members for select to authenticated
  using (user_id = auth.uid());
create policy "Members leave their own Click"
  on public.tank_click_members for delete to authenticated
  using (user_id = auth.uid());
create policy "Admins manage Click membership"
  on public.tank_click_members for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Public reads active Tank chat" on public.tank_chat_messages;
create policy "Public reads active Global and room chat"
  on public.tank_chat_messages for select to anon, authenticated
  using (deleted_at is null and click_id is null and room_id <> 'director');
create policy "Click members read their active chat"
  on public.tank_chat_messages for select to authenticated
  using (
    deleted_at is null
    and click_id is not null
    and exists (
      select 1 from public.tank_click_members cm
      where cm.click_id = tank_chat_messages.click_id and cm.user_id = auth.uid()
    )
  );

drop policy if exists "Public reads Tank chat reactions" on public.tank_chat_reactions;
drop policy if exists "Members add their Tank chat reactions" on public.tank_chat_reactions;
drop policy if exists "Members remove their Tank chat reactions" on public.tank_chat_reactions;

create policy "Readers see reactions for visible chat"
  on public.tank_chat_reactions for select to anon, authenticated
  using (exists (
    select 1 from public.tank_chat_messages m
    where m.id = tank_chat_reactions.message_id
      and m.deleted_at is null
      and (
        m.click_id is null
        or (auth.uid() is not null and exists (
          select 1 from public.tank_click_members cm
          where cm.click_id = m.click_id and cm.user_id = auth.uid()
        ))
      )
  ));
create policy "Members add reactions to visible chat"
  on public.tank_chat_reactions for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.tank_chat_messages m where m.id = message_id)
  );
create policy "Members remove their reactions from visible chat"
  on public.tank_chat_reactions for delete to authenticated
  using (
    auth.uid() = user_id
    and exists (select 1 from public.tank_chat_messages m where m.id = message_id)
  );

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
  v_click_id uuid;
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
    room_id, click_id, user_id, user_name, user_role, body, message_type,
    client_nonce, reply_to_message_id, reply_to_user_id
  ) values (
    p_room_id, v_click_id, p_user_id,
    left(coalesce(nullif(btrim(p_user_name), ''), 'Member'), 80),
    case when lower(coalesce(p_user_role, 'member')) in ('viewer','member','regular','vip','moderator','admin')
      then lower(p_user_role) else 'member' end,
    btrim(p_body), 'text',
    case when p_client_nonce is null then null else left(p_client_nonce, 128) end,
    p_reply_to_message_id, v_reply.user_id
  ) returning * into v_message;

  update public.tank_chat_member_state set last_message_at = v_now, updated_at = v_now
  where user_id = p_user_id;
  return v_message;
exception when unique_violation then
  if p_client_nonce is null then raise; end if;
  select * into v_existing from public.tank_chat_messages
  where user_id = p_user_id and client_nonce = left(p_client_nonce, 128) limit 1;
  return v_existing;
end;
$$;

-- Postgres Changes gives Click chat RLS-aware realtime without a guessable
-- public Broadcast channel. Keep this idempotent for self-hosted upgrades.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tank_chat_messages'
  ) then
    alter publication supabase_realtime add table public.tank_chat_messages;
  end if;
end;
$$;
