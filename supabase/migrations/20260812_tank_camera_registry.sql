-- Migration: 20260812_tank_camera_registry.sql
-- Description: Ingest stream key registry, audio track assignment, and stream event logging for Tank platform

CREATE TABLE IF NOT EXISTS public.tank_camera_registry (
  camera_id TEXT PRIMARY KEY,
  stream_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'srt', -- 'srt', 'srtla', 'rtmp', 'ip-camera'
  status TEXT NOT NULL DEFAULT 'offline', -- 'offline', 'connecting', 'active', 'reconnecting', 'retired'
  public_visible BOOLEAN NOT NULL DEFAULT false,
  has_been_live BOOLEAN NOT NULL DEFAULT false,
  bitrate_kbps INTEGER DEFAULT 0,
  latency_ms INTEGER,
  last_seen_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  retire_at TIMESTAMPTZ,
  key_fingerprint TEXT,
  audio_source_id TEXT, -- Assigned audio track (e.g. 'self', 'house-ambient-mic', 'cam-a-audio')
  audio_source_name TEXT, -- Human readable audio track label (e.g. 'House Ambient Mic')
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tank_ingest_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  camera_id TEXT NOT NULL REFERENCES public.tank_camera_registry(camera_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'stream_start', 'stream_stop', 'bitrate_low', 'reconnect_grace', 'stream_retired', 'audio_track_assigned'
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tank_camera_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_ingest_events ENABLE ROW LEVEL SECURITY;

-- Policies for tank_camera_registry
CREATE POLICY "Public can view visible live streams"
  ON public.tank_camera_registry
  FOR SELECT
  USING (public_visible = true);

CREATE POLICY "Admins and service role have full access to tank_camera_registry"
  ON public.tank_camera_registry
  FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() ->> 'role') = 'service_role'
    OR auth.role() = 'service_role'
  );

-- Policies for tank_ingest_events
CREATE POLICY "Admins and service role have full access to tank_ingest_events"
  ON public.tank_ingest_events
  FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() ->> 'role') = 'service_role'
    OR auth.role() = 'service_role'
  );

-- Trigger for auto updating updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_tank_camera_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_tank_camera_updated_at ON public.tank_camera_registry;
CREATE TRIGGER set_tank_camera_updated_at
  BEFORE UPDATE ON public.tank_camera_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tank_camera_updated_at();
