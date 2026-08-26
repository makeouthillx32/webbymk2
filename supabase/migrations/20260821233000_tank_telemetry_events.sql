-- Migration: 20260821233000_tank_telemetry_events.sql
-- Real-time client stream telemetry event beaconing ledger.

CREATE TABLE IF NOT EXISTS public.tank_telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id TEXT NOT NULL,
  room_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  protocol TEXT NOT NULL,
  latency_ms INTEGER,
  stall_count INTEGER DEFAULT 0,
  bitrate_kbps INTEGER,
  fps NUMERIC(5, 2),
  packet_loss_rate NUMERIC(5, 4),
  client_network_type TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tank_telemetry_events_created_at 
ON public.tank_telemetry_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tank_telemetry_events_camera_id 
ON public.tank_telemetry_events (camera_id, created_at DESC);

ALTER TABLE public.tank_telemetry_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon and users to insert stream telemetry" ON public.tank_telemetry_events;
CREATE POLICY "Allow anon and users to insert stream telemetry" 
ON public.tank_telemetry_events
FOR INSERT 
TO public, anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role and admins to view stream telemetry" ON public.tank_telemetry_events;
CREATE POLICY "Allow service role and admins to view stream telemetry" 
ON public.tank_telemetry_events
FOR SELECT 
TO authenticated, service_role
USING (true);
