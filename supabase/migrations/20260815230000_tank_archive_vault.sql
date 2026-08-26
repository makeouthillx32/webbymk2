-- Migration: 20260815230000_tank_archive_vault.sql
-- Video Archive & VOD System modeled after fishtank.live/archives

-- 1. Upgrade tank_archives schema
ALTER TABLE public.tank_archives ADD COLUMN IF NOT EXISTS season_slug TEXT NOT NULL DEFAULT 's01';
ALTER TABLE public.tank_archives ADD COLUMN IF NOT EXISTS recorded_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.tank_archives ADD COLUMN IF NOT EXISTS start_time TIME NOT NULL DEFAULT '00:00:00';
ALTER TABLE public.tank_archives ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE public.tank_archives ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.tank_archives ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.tank_archives ADD COLUMN IF NOT EXISTS storage_bucket TEXT NOT NULL DEFAULT 'tank-archives';
ALTER TABLE public.tank_archives ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE public.tank_archives ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0;
ALTER TABLE public.tank_archives ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Default room_slug fallback
ALTER TABLE public.tank_archives ALTER COLUMN room_slug SET DEFAULT 'all-rooms';

-- Indexes for instant sub-millisecond filtering matching fishtank.live/archives query params
CREATE INDEX IF NOT EXISTS tank_archives_season_room_date_idx
  ON public.tank_archives (season_slug, room_slug, recorded_date);

CREATE INDEX IF NOT EXISTS tank_archives_file_name_idx
  ON public.tank_archives (file_name);

-- 2. Storage Bucket setup for tank-archives
INSERT INTO storage.buckets (id, name, public)
VALUES ('tank-archives', 'tank-archives', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can read tank-archives bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tank-archives');

CREATE POLICY "Admins manage tank-archives bucket"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'tank-archives' AND (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      OR auth.role() = 'service_role'
    )
  );

-- 3. Seed initial sample archive entries for Season 1
INSERT INTO public.tank_archives (
  season_slug,
  room_slug,
  recorded_date,
  start_time,
  duration_seconds,
  title,
  episode_number,
  file_name,
  storage_path,
  video_url,
  thumbnail_url,
  description,
  metadata
)
VALUES
(
  's01',
  'game-room',
  CURRENT_DATE,
  '00:05:05',
  1800,
  'Season 1 - Game Room Midnight Shift',
  1,
  's01_game-room_' || TO_CHAR(CURRENT_DATE, 'YY-MM-DD') || '_00-05-05.mp4',
  'seasons/s01/game-room/' || TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') || '/s01_game-room_' || TO_CHAR(CURRENT_DATE, 'YY-MM-DD') || '_00-05-05.mp4',
  'https://cdn.fishtank.live/archives/s01_bedroom-1_23-05-11_00-05-05.mp4',
  'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/screw-top-left.png',
  'Game room live archive recording chunk.',
  '{"camera_id": "cam-1786768240090", "resolution": "1080p", "fps": 30}'::jsonb
)
ON CONFLICT DO NOTHING;
