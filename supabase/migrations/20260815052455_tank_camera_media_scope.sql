-- Tank receiver media-scope contract and trusted external-audio registry.
-- Public clients consume /api/tank/cameras; they never query credential-bearing
-- registry rows directly.

alter table public.tank_camera_registry
  add column if not exists room_scope text not null default 'unscoped',
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists audio_mode text not null default 'auto',
  add column if not exists audio_status text not null default 'probe-required',
  add column if not exists audio_warning text,
  add column if not exists native_audio_muted boolean not null default false,
  add column if not exists cross_room_audio_confirmed boolean not null default false;

update public.tank_camera_registry
set audio_source_id = null,
    audio_source_name = null
where audio_source_id = 'self';

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_attribute attr
      on attr.attrelid = con.conrelid
     and attr.attnum = any(con.conkey)
    where con.conrelid = 'public.tank_camera_registry'::regclass
      and con.contype = 'c'
      and attr.attname = 'audio_mode'
  loop
    execute format(
      'alter table public.tank_camera_registry drop constraint %I',
      constraint_name
    );
  end loop;
end
$$;

-- Reconcile the earlier draft's native/muted vocabulary after removing its
-- generated check constraint, then install the receiver-contract vocabulary.
update public.tank_camera_registry
set audio_mode = case audio_mode
  when 'native' then 'embedded'
  when 'muted' then 'none'
  else audio_mode
end;

alter table public.tank_camera_registry
  alter column audio_mode set default 'auto';

do $$
begin
  alter table public.tank_camera_registry
    add constraint tank_camera_registry_audio_mode_check
    check (audio_mode in ('auto', 'embedded', 'none', 'external'));

  if not exists (
    select 1 from pg_constraint
    where conname = 'tank_camera_registry_audio_status_check'
      and conrelid = 'public.tank_camera_registry'::regclass
  ) then
    alter table public.tank_camera_registry
      add constraint tank_camera_registry_audio_status_check
      check (audio_status in (
        'embedded',
        'silent',
        'external-ready',
        'missing-audio',
        'probe-required',
        'transcode-required'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tank_camera_registry_room_scope_check'
      and conrelid = 'public.tank_camera_registry'::regclass
  ) then
    alter table public.tank_camera_registry
      add constraint tank_camera_registry_room_scope_check
      check (room_scope = lower(room_scope) and room_scope ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  end if;
end
$$;

create table if not exists public.tank_audio_sources (
  id text primary key,
  name text not null,
  room_scope text not null,
  online boolean not null default false,
  codec text,
  channels smallint,
  sample_rate_hz integer,
  tags text[] not null default '{}'::text[],
  kind text,
  connection_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tank_audio_sources_room_scope_check
    check (room_scope = lower(room_scope) and room_scope ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint tank_audio_sources_channels_check
    check (channels is null or channels > 0),
  constraint tank_audio_sources_sample_rate_check
    check (sample_rate_hz is null or sample_rate_hz > 0)
);

alter table public.tank_audio_sources
  add column if not exists room_scope text not null default 'unscoped',
  add column if not exists online boolean not null default false,
  add column if not exists codec text,
  add column if not exists channels smallint,
  add column if not exists sample_rate_hz integer,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists kind text,
  add column if not exists connection_hint text,
  add column if not exists updated_at timestamptz not null default now();

update public.tank_audio_sources
set room_scope = case id
  when 'house-ambient-mic' then 'game-room'
  when 'house-main-mic' then 'house'
  else room_scope
end,
tags = case id
  when 'house-main-mic' then array['shared-audio']::text[]
  else tags
end;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tank_audio_sources_room_scope_check'
      and conrelid = 'public.tank_audio_sources'::regclass
  ) then
    alter table public.tank_audio_sources
      add constraint tank_audio_sources_room_scope_check
      check (room_scope = lower(room_scope) and room_scope ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'tank_audio_sources_channels_check'
      and conrelid = 'public.tank_audio_sources'::regclass
  ) then
    alter table public.tank_audio_sources
      add constraint tank_audio_sources_channels_check
      check (channels is null or channels > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'tank_audio_sources_sample_rate_check'
      and conrelid = 'public.tank_audio_sources'::regclass
  ) then
    alter table public.tank_audio_sources
      add constraint tank_audio_sources_sample_rate_check
      check (sample_rate_hz is null or sample_rate_hz > 0);
  end if;
end
$$;

create index if not exists tank_audio_sources_room_scope_idx
  on public.tank_audio_sources (room_scope);

alter table public.tank_audio_sources enable row level security;

drop policy if exists "Service role manages Tank audio sources"
  on public.tank_audio_sources;
drop policy if exists "Admins and service role have full access to tank_audio_sources"
  on public.tank_audio_sources;
create policy "Service role manages Tank audio sources"
  on public.tank_audio_sources
  for all
  to service_role
  using (true)
  with check (true);

-- The legacy public SELECT policy exposed every registry column, including
-- stream_key. Public camera discovery now goes exclusively through the
-- credential-redacting server API.
drop policy if exists "Public can view visible live streams"
  on public.tank_camera_registry;
revoke all on table public.tank_camera_registry from anon, authenticated;
revoke all on table public.tank_audio_sources from anon, authenticated;
grant all on table public.tank_camera_registry to service_role;
grant all on table public.tank_audio_sources to service_role;

drop trigger if exists set_tank_audio_source_updated_at
  on public.tank_audio_sources;
create trigger set_tank_audio_source_updated_at
  before update on public.tank_audio_sources
  for each row
  execute function public.update_tank_camera_updated_at();

insert into public.tank_audio_sources
  (id, name, room_scope, online, codec, channels, sample_rate_hz, tags, kind, connection_hint)
values
  ('house-ambient-mic', 'House Ambient Microphone (Room 1)', 'game-room', false, null, null, null, '{}', 'house-mic', null),
  ('house-main-mic', 'House Main Audio (Mixer Line Out)', 'house', false, null, null, null, '{shared-audio}', 'line-in', null),
  ('ip-room-cam-audio', 'Game Room Camera Audio', 'game-room', false, null, null, null, '{}', 'ip-mic', null),
  ('oc-setup-cam-audio', 'OC Setup Camera Audio', 'game-room', false, null, null, null, '{}', 'ip-mic', null)
on conflict (id) do nothing;
