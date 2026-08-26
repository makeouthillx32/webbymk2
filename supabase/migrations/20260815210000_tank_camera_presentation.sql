-- Migration: 20260815210000_tank_camera_presentation.sql
-- Description: Presentation metadata for tank_camera_registry (description,
-- accent color, location label, sort priority) so the admin dashboard can
-- curate camera identity without hand-editing src/zones/tank/fixtures.ts.
-- Existing RLS on tank_camera_registry (public SELECT when public_visible,
-- admin/service ALL) already covers these columns — no new policies needed.

ALTER TABLE public.tank_camera_registry
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS accent TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;
