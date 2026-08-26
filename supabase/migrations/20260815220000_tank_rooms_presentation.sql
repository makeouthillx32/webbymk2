-- Migration: 20260815220000_tank_rooms_presentation.sql
-- Description: Presentation-only curation table for Tank rooms. Room
-- EXISTENCE is always derived live from camera roomScope groupings
-- (src/zones/tank/server/roomProjection.ts) — this table never decides
-- whether a room exists, only how it's labeled and (optionally) whether it
-- should persist while offline vs only while live.

CREATE TABLE IF NOT EXISTS public.tank_rooms (
  room_key TEXT PRIMARY KEY,
  title TEXT,
  eyebrow TEXT,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  visibility_policy TEXT CHECK (visibility_policy IN ('always-show', 'live-only')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.tank_rooms IS
  'Presentation curation for Tank rooms only. Existence/visibility is computed live from camera roomScope + presence, not stored here. visibility_policy is nullable: null means infer from the cameras in the room (IP/SRT cameras -> always-show with a no-signal state when offline; OBS/RTMP-only rooms -> live-only, room disappears when nothing is publishing). A non-null value overrides the inference.';

ALTER TABLE public.tank_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view room presentation"
  ON public.tank_rooms
  FOR SELECT
  USING (true);

CREATE POLICY "Admins and service role have full access to tank_rooms"
  ON public.tank_rooms
  FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() ->> 'role') = 'service_role'
    OR auth.role() = 'service_role'
  );

DROP TRIGGER IF EXISTS set_tank_rooms_updated_at ON public.tank_rooms;
CREATE TRIGGER set_tank_rooms_updated_at
  BEFORE UPDATE ON public.tank_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tank_camera_updated_at();
