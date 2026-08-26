-- Tank camera/room audio routing — real bones, replacing the admin console's
-- "Audio Track Binding" dropdown that previously only updated local React
-- state and persisted nothing.
--
-- Model: audio config lives per-camera (not per-room). A room's audio status
-- is simply whatever its camera(s) resolve to — this keeps one source of
-- truth instead of duplicating state at the room level, while still letting
-- different rooms "cope" independently since each camera carries its own
-- config.
--
-- audio_mode:
--   'native'   — use the camera's own embedded audio track (SRTLA phone cams
--                 default here; some IP cams also have a mic).
--   'external' — substitute a Tank-side audio source (an IP mic, or an
--                 existing house mic/mixer line) because the camera has no
--                 mic, or its mic shouldn't be used. audio_source_id must
--                 reference tank_audio_sources in this mode.
--   'muted'    — deliberately no audio (a video-only overview cam by design).
--
-- has_native_audio is an explicit admin-set flag, not auto-probed — the
-- receiver manager doesn't currently expose whether a camera's stream
-- carries an audio track, so guessing would be dishonest. Default true
-- (matches prior behavior / SRTLA phone cams); IP cameras without a
-- confirmed mic should be flagged false by whoever wires them up.

alter table public.tank_camera_registry
  add column if not exists has_native_audio boolean not null default true,
  add column if not exists audio_mode text not null default 'native'
    check (audio_mode in ('native', 'external', 'muted'));

comment on column public.tank_camera_registry.has_native_audio is
  'Admin-confirmed: does this camera''s own feed carry usable audio? Not auto-detected.';
comment on column public.tank_camera_registry.audio_mode is
  'native = camera''s own track, external = tank_audio_sources row, muted = deliberately silent.';

-- Real catalog of audio sources operators can assign to a camera, replacing
-- the hardcoded array that used to live in admin/LiveCameraRegistry.tsx.
create table if not exists public.tank_audio_sources (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('ip-mic', 'line-in', 'house-mic')),
  connection_hint text,
  created_at timestamptz not null default now()
);

comment on table public.tank_audio_sources is
  'Real catalog of external audio sources (IP mics, house mics, mixer line-ins) available to assign to cameras with audio_mode = external.';

alter table public.tank_audio_sources enable row level security;

drop policy if exists "Admins and service role have full access to tank_audio_sources" on public.tank_audio_sources;
create policy "Admins and service role have full access to tank_audio_sources"
  on public.tank_audio_sources for all
  to service_role
  using (true)
  with check (true);

-- Seed the two house sources that were already hardcoded as options in the
-- admin UI (so existing operator expectations don't change), now as real
-- rows instead of fake dropdown entries.
insert into public.tank_audio_sources (id, name, kind, connection_hint)
values
  ('house-ambient-mic', 'House Ambient Microphone (Room 1)', 'house-mic', 'Fixed room ambient mic — connection details TBD by ops.'),
  ('house-main-mic', 'House Main Audio (Mixer Line Out)', 'line-in', 'Mixer line-out feed — connection details TBD by ops.')
on conflict (id) do nothing;

-- Cam0 is verified to carry embedded PCM A-law 8 kHz mono. Browser delivery
-- still requires an Opus/AAC transcode worker, but the native track exists.
-- This only takes effect once the row exists (receiverManager.ts upserts it
-- on first successful poll); safe no-op otherwise.
update public.tank_camera_registry
set has_native_audio = true
where camera_id = 'cam-1786768240090';
