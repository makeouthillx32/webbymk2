-- Migration: Seed standard tank_rooms and allow dynamic rooms (e.g. IRL-1, IRL-2) in tank_chat_messages

INSERT INTO public.tank_rooms (id, slug, title, is_public, display_order)
VALUES
  ('global', 'global', 'Global Chat', true, 0),
  ('director', 'director', 'Director Feed', true, 1),
  ('living-room', 'living-room', 'Living Room', true, 2),
  ('game-room', 'game-room', 'Game Room', true, 3),
  ('basement', 'basement', 'Basement', true, 4),
  ('irl-1', 'irl-1', 'IRL Cam 1', true, 5),
  ('irl-2', 'irl-2', 'IRL Cam 2', true, 6)
ON CONFLICT (id) DO NOTHING;

-- Drop foreign key constraint on room_id so dynamic rooms (e.g. IRL cams) can stream chat freely without strict FK collisions
ALTER TABLE public.tank_chat_messages DROP CONSTRAINT IF EXISTS tank_chat_messages_room_id_fkey;
