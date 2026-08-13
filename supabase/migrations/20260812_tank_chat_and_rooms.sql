-- Migration: 20260812_tank_chat_and_rooms.sql
-- Description: Creates durable tables for channels, rooms, platform settings (launch mode), and chat messages

CREATE TABLE IF NOT EXISTS public.tank_platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tank_channels (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  handle TEXT NOT NULL,
  bio TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  followers INTEGER NOT NULL DEFAULT 0,
  live BOOLEAN NOT NULL DEFAULT true,
  category TEXT NOT NULL DEFAULT 'Live Event',
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tank_rooms (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  eyebrow TEXT,
  description TEXT,
  channel_id TEXT REFERENCES public.tank_channels(id) ON DELETE CASCADE,
  camera_ids TEXT[] NOT NULL DEFAULT '{}',
  featured_camera_id TEXT,
  live BOOLEAN NOT NULL DEFAULT true,
  viewers INTEGER NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tank_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES public.tank_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL DEFAULT 'viewer', -- 'viewer', 'member', 'moderator', 'admin'
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Launch Mode Platform Setting
INSERT INTO public.tank_platform_settings (key, value)
VALUES ('launch_mode', '{"enabled": true, "eventName": "24/7 Live House"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Enable RLS
ALTER TABLE public.tank_platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_chat_messages ENABLE ROW LEVEL SECURITY;

-- Public Read Policies
CREATE POLICY "Public can view platform settings"
  ON public.tank_platform_settings FOR SELECT USING (true);

CREATE POLICY "Public can view channels"
  ON public.tank_channels FOR SELECT USING (true);

CREATE POLICY "Public can view rooms"
  ON public.tank_rooms FOR SELECT USING (true);

CREATE POLICY "Public can view chat messages"
  ON public.tank_chat_messages FOR SELECT USING (true);

-- Authenticated Chat Insert Policy
CREATE POLICY "Authenticated users can insert chat messages"
  ON public.tank_chat_messages
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND length(trim(body)) > 0
  );

-- Admin & Service Role Full Access Policies
CREATE POLICY "Admins have full access to platform settings"
  ON public.tank_platform_settings FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() ->> 'role') = 'service_role'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Admins have full access to channels"
  ON public.tank_channels FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() ->> 'role') = 'service_role'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Admins have full access to rooms"
  ON public.tank_rooms FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() ->> 'role') = 'service_role'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Admins have full access to chat messages"
  ON public.tank_chat_messages FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() ->> 'role') = 'service_role'
    OR auth.role() = 'service_role'
  );
