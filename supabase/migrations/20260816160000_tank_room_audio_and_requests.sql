-- Migration: 20260816160000_tank_room_audio_and_requests.sql
-- Description: Per-room audio OUTPUT configuration (independent of any
-- camera — "line out"), plus a unified TTS/SFX audio-request system that
-- spends tokens from the existing tank_token_transactions ledger and can
-- target either the site-wide "website" audio bus or one specific room.
--
-- Room audio output model (kept intentionally simple for v1):
--   'embedded'         - default. No dedicated output; audio (if any) comes
--                         from whatever camera is in the room. Current/only
--                         behavior before this migration.
--   'client-broadcast' - any device with Tank open and "assigned" to this
--                         room (a local per-browser setting, not stored
--                         server-side) plays incoming audio-request events
--                         through its own OS audio output — e.g. a tablet in
--                         the Living Room with its OS output already
--                         Bluetooth-paired to a speaker. No new host
--                         infrastructure required for this kind.
--   'host-bluetooth'   - reserved for a future centrally-managed output
--                         (POWER driving a named Bluetooth device directly).
--                         Not implemented yet — audio_output_config can hold
--                         a device name/id once it is, so the data model
--                         doesn't need to change later.

ALTER TABLE public.tank_rooms
  ADD COLUMN IF NOT EXISTS audio_output_kind TEXT NOT NULL DEFAULT 'embedded'
    CHECK (audio_output_kind IN ('embedded', 'client-broadcast', 'host-bluetooth')),
  ADD COLUMN IF NOT EXISTS audio_output_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tank_rooms.audio_output_kind IS
  'Where this room''s TTS/SFX/system-mix audio actually plays. embedded = tied to the room''s camera (default, no dedicated output). client-broadcast = any device with Tank open and locally assigned to this room plays it via its own OS audio output. host-bluetooth = reserved for a future centrally-managed output device.';
COMMENT ON COLUMN public.tank_rooms.audio_output_config IS
  'Kind-specific config. Empty for embedded/client-broadcast today. Will hold a device name/id for host-bluetooth once that kind is implemented.';

-- ─────────────────────────────────────────────────────────────────────────
-- Unified TTS + SFX request queue. Same shape, same token-spend/refund
-- flow, same moderation flow — the only real difference is which payload
-- field is populated, so one table beats two near-duplicates.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_audio_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('tts', 'sfx')),
  -- tts: the message text to synthesize. sfx: null.
  message TEXT,
  -- tts: voice preset id. sfx: the soundboard bucket key being played.
  -- Column is shared because exactly one of (message, voice_or_sound_key)
  -- semantics applies per kind and adding a second nullable pair per kind
  -- doesn't earn its keep for two fields.
  voice_or_sound_key TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'website' CHECK (target_type IN ('website', 'room')),
  target_room_key TEXT REFERENCES public.tank_rooms (room_key) ON DELETE SET NULL,
  cost INTEGER NOT NULL CHECK (cost >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'played')),
  token_transaction_id UUID REFERENCES public.tank_token_transactions (id) ON DELETE SET NULL,
  refund_transaction_id UUID REFERENCES public.tank_token_transactions (id) ON DELETE SET NULL,
  moderated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  moderated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tank_audio_requests_room_target_needs_room_key
    CHECK (target_type = 'website' OR target_room_key IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS tank_audio_requests_status_created_at_idx
  ON public.tank_audio_requests (status, created_at);
CREATE INDEX IF NOT EXISTS tank_audio_requests_user_id_idx
  ON public.tank_audio_requests (user_id, created_at);

ALTER TABLE public.tank_audio_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own audio requests"
  ON public.tank_audio_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins and service role manage audio requests"
  ON public.tank_audio_requests FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- Producer-facing on/off switches, matching tank_platform_settings'
-- existing key/value convention (see launch_mode).
INSERT INTO public.tank_platform_settings (key, value)
VALUES
  ('tts_enabled', '{"enabled": false}'::jsonb),
  ('sfx_enabled', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
