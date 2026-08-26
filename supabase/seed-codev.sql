-- supabase/seed-codev.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Sample Tank room data for a local `unaxis codev init` instance only.
--
-- A freshly provisioned Supabase instance has zero app data — the real
-- migrations create the schema, not sample rows. Without this, Tank would
-- render entirely off its client-side fixture fallback (src/zones/tank/
-- fixtures.ts) rather than anything DB-backed, which isn't representative of
-- how the app actually behaves. These 7 rows mirror that same fixtures.ts
-- file exactly (camera ids, slugs, titles) so local dev matches what a
-- contributor would already recognize from reading the source.
--
-- Never run against the real production/dev database — this is applied
-- automatically by `unaxis codev init` against a brand-new local-only
-- instance, and only there.
-- ─────────────────────────────────────────────────────────────────────────────

-- tank_rooms.channel_id has a foreign key to tank_channels(id) — must exist
-- first. Confirmed live via a real provisioning run: the rooms insert below
-- 400'd with "violates foreign key constraint tank_rooms_channel_id_fkey"
-- until this was added.
insert into tank_channels (
  id, slug, name, handle, bio, verified, followers, live, category
) values
  ('channel-director',    'director',    'Tank Director', '@tankdirector', 'The continuous program feed, cut live from every connected house camera.', true,  0, false, 'IRL'),
  ('channel-game-room',   'game-room',   'Game Room',      '@gameroom',     'The game room camera feed.',      false, 0, false, 'IRL'),
  ('channel-living-room', 'living-room', 'Living Room',    '@livingroom',   'The living room camera feed.',    false, 0, false, 'IRL'),
  ('channel-kitchen',     'kitchen',     'Kitchen',        '@kitchen',      'The kitchen camera feed.',        false, 0, false, 'IRL'),
  ('channel-foyer',       'foyer',       'The Foyer',      '@foyer',        'The foyer camera feed.',          false, 0, false, 'IRL'),
  ('channel-makeup-room', 'makeup-room', 'Makeup Room',    '@makeuproom',   'The makeup room camera feed.',    false, 0, false, 'IRL'),
  ('channel-game-room-2', 'game-room-2', 'Game Room 2',    '@gameroom2',    'The game room 2 camera feed.',    false, 0, false, 'IRL')
on conflict (id) do nothing;

insert into tank_rooms (
  id, slug, title, eyebrow, description, channel_id,
  camera_ids, featured_camera_id, live, viewers, tags,
  room_key, audio_output_kind, audio_output_config
) values
  (
    'room-program', 'director', 'Director Live', 'Main program',
    'One continuously directed feed, switching across every connected house camera as it comes online.',
    'channel-director',
    ARRAY['cam-1786768240090','cam-1786768240091','cam-1786768240092','cam-1786768240093','cam-1786768240094','cam-1786768240095'],
    'cam-1786768240090', false, 0, ARRAY['Live','Multi-camera'],
    'director', 'embedded', '{}'::jsonb
  ),
  (
    'room-game-room', 'game-room', 'Game Room', 'First room',
    'The game room camera feed.', 'channel-game-room',
    ARRAY['cam-1786768240090'], 'cam-1786768240090', false, 0, ARRAY['Game room','IRL'],
    'game-room', 'embedded', '{}'::jsonb
  ),
  (
    'room-living-room', 'living-room', 'Living Room', 'Second room',
    'The living room camera feed.', 'channel-living-room',
    ARRAY['cam-1786768240091'], 'cam-1786768240091', false, 0, ARRAY['Living room','IRL'],
    'living-room', 'embedded', '{}'::jsonb
  ),
  (
    'room-kitchen', 'kitchen', 'Kitchen', 'Third room',
    'The kitchen camera feed.', 'channel-kitchen',
    ARRAY['cam-1786768240092'], 'cam-1786768240092', false, 0, ARRAY['Kitchen','IRL'],
    'kitchen', 'embedded', '{}'::jsonb
  ),
  (
    'room-foyer', 'foyer', 'The Foyer', 'Fourth room',
    'The foyer camera feed.', 'channel-foyer',
    ARRAY['cam-1786768240093'], 'cam-1786768240093', false, 0, ARRAY['The Foyer','IRL'],
    'foyer', 'embedded', '{}'::jsonb
  ),
  (
    'room-makeup-room', 'makeup-room', 'Makeup Room', 'Fifth room',
    'The makeup room camera feed.', 'channel-makeup-room',
    ARRAY['cam-1786768240094'], 'cam-1786768240094', false, 0, ARRAY['Makeup Room','IRL'],
    'makeup-room', 'embedded', '{}'::jsonb
  ),
  (
    'room-game-room-2', 'game-room-2', 'Game Room 2', 'Sixth room',
    'The game room 2 camera feed.', 'channel-game-room-2',
    ARRAY['cam-1786768240095'], 'cam-1786768240095', false, 0, ARRAY['Game Room 2','IRL'],
    'game-room-2', 'embedded', '{}'::jsonb
  )
on conflict (id) do nothing;
