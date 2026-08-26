-- Migration: 20260821234500_tank_audio_sources_stream_url.sql
-- Add stream_url column to tank_audio_sources table.

ALTER TABLE public.tank_audio_sources 
ADD COLUMN IF NOT EXISTS stream_url TEXT;

UPDATE public.tank_audio_sources
SET stream_url = connection_hint
WHERE stream_url IS NULL AND connection_hint IS NOT NULL;
