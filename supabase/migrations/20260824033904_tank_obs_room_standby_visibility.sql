-- Forward repair for the legacy tank_rooms table.
--
-- The earlier presentation migration used CREATE TABLE IF NOT EXISTS, so it
-- did not add its columns when the original room-directory table already
-- existed. Keep the legacy id/slug contract and add the projection keys the
-- current Tank server actually reads.

ALTER TABLE public.tank_rooms
  ADD COLUMN IF NOT EXISTS room_key TEXT,
  ADD COLUMN IF NOT EXISTS visibility_policy TEXT,
  ADD COLUMN IF NOT EXISTS audio_input_source_id TEXT;

UPDATE public.tank_rooms
SET room_key = COALESCE(NULLIF(slug, ''), id)
WHERE room_key IS NULL OR room_key = '';

ALTER TABLE public.tank_rooms
  ALTER COLUMN room_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tank_rooms_room_key_key
  ON public.tank_rooms (room_key);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tank_rooms_visibility_policy_check'
      AND conrelid = 'public.tank_rooms'::regclass
  ) THEN
    ALTER TABLE public.tank_rooms
      ADD CONSTRAINT tank_rooms_visibility_policy_check
      CHECK (visibility_policy IN ('always-show', 'live-only'));
  END IF;
END
$$;

COMMENT ON COLUMN public.tank_rooms.room_key IS
  'Stable camera roomScope key used to merge presentation onto live-derived rooms.';
COMMENT ON COLUMN public.tank_rooms.visibility_policy IS
  'Nullable override: always-show preserves an offline no-signal room; live-only hides it.';

-- Admin's registered OBS room remains visible as a no-signal standby when the
-- publisher is offline. The actual feed is still derived from tank_obs_rooms;
-- this row contains presentation policy only.
INSERT INTO public.tank_rooms (
  id,
  slug,
  title,
  room_key,
  visibility_policy,
  live,
  viewers,
  camera_ids,
  tags,
  audio_output_kind,
  audio_output_config
)
VALUES (
  'admin',
  'admin',
  'Admin',
  'admin',
  'always-show',
  false,
  0,
  ARRAY[]::TEXT[],
  ARRAY['obs', 'admin-room']::TEXT[],
  'embedded',
  '{}'::JSONB
)
ON CONFLICT (id) DO UPDATE
SET room_key = EXCLUDED.room_key,
    visibility_policy = EXCLUDED.visibility_policy,
    updated_at = NOW();
