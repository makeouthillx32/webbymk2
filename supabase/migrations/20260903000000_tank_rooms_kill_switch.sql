-- Migration: 20260903000000_tank_rooms_kill_switch.sql
-- Description: Admin-only per-room kill-switch. deriveRooms()
-- (src/zones/tank/server/roomProjection.ts) omits a room entirely from its
-- output when is_offline is true — not a client-side hide, a real absence:
-- no camera URL or room metadata for that room ever leaves the server.
-- Existing RLS on tank_rooms already scopes writes to admin/service_role
-- (see 20260815220000_tank_rooms_presentation.sql) — no policy change needed.

ALTER TABLE public.tank_rooms
  ADD COLUMN IF NOT EXISTS is_offline BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tank_rooms.is_offline IS
  'Admin kill-switch. When true, deriveRooms() omits this room from every response entirely (not flagged-but-hidden). See src/zones/tank/server/cameraRegistryDb.ts setRoomOffline/setAllRoomsOffline.';
