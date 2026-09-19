-- Migration: 20260913040000_tank_stream_goals.sql
-- Description: Stream goals — the "Follower goal 243/254" bar — as a first-class
-- Tank overlay instead of a third-party widget pasted into OBS.
--
-- SOURCE-AGNOSTIC ON PURPOSE. The obvious goal is followers, and followers are
-- the one number Tank cannot currently produce: that needs Twitch/Kick/YouTube
-- OAuth, and no provider credentials are configured (see
-- tank_chat_provider_connections, every row still 'disconnected'). Building
-- this against followers alone would have shipped a bar that can only ever
-- read 0.
--
-- So the goal names its SOURCE and the server resolves it. `manual` and
-- `viewers` work today; `followers` starts working the moment a provider is
-- connected, with no schema change and nothing to rebuild.

CREATE TABLE IF NOT EXISTS public.tank_stream_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What the overlay prints, e.g. "Follower goal". Free text: this is the one
  -- part of the bar an operator changes most often and it should never require
  -- a deploy.
  label TEXT NOT NULL DEFAULT 'Follower goal',

  -- Where `current` comes from.
  --   manual    — staff type the number. Works today, and is the honest
  --               fallback for anything Tank cannot measure.
  --   viewers   — live presence count. Works today.
  --   followers — per-provider follower count. Requires a connected provider.
  --   drops / tavern — house gamification counters.
  source TEXT NOT NULL DEFAULT 'manual',

  -- Only meaningful for source = 'followers'; which platform to count.
  source_provider TEXT,

  -- The number staff are aiming at. Positive by constraint: a goal of zero is
  -- either a typo or a division by zero waiting to render as NaN% on air.
  target INTEGER NOT NULL DEFAULT 100,

  -- Last known value. For `manual` this IS the value; for computed sources it
  -- is a cache so the overlay has something to draw before the first refresh,
  -- and something to hold if the source goes away mid-broadcast.
  current_value INTEGER NOT NULL DEFAULT 0,

  -- Presentation, kept here rather than in the URL so it can be changed from
  -- the console while the source is live in OBS.
  accent_color TEXT NOT NULL DEFAULT '#f59e0b',
  show_count BOOLEAN NOT NULL DEFAULT true,

  -- One goal is on air at a time, but several can be kept ready. Ordering
  -- decides which the overlay picks when more than one is active.
  is_active BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,

  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tank_stream_goals_source_check
    CHECK (source IN ('manual', 'viewers', 'followers', 'drops', 'tavern')),
  CONSTRAINT tank_stream_goals_provider_check
    CHECK (source_provider IS NULL OR source_provider IN ('twitch', 'kick', 'youtube', 'trovo')),
  CONSTRAINT tank_stream_goals_target_positive CHECK (target > 0),
  CONSTRAINT tank_stream_goals_current_not_negative CHECK (current_value >= 0)
);

CREATE INDEX IF NOT EXISTS tank_stream_goals_active_idx
  ON public.tank_stream_goals (sort_order, updated_at DESC)
  WHERE is_active;

ALTER TABLE public.tank_stream_goals ENABLE ROW LEVEL SECURITY;

-- PUBLIC READ, like tank_overlay_settings and for the same reason: an OBS
-- browser source is unauthenticated and cannot be given a session. A goal bar
-- is already visible to every viewer of the stream by definition — there is
-- nothing here that is not on screen.
DROP POLICY IF EXISTS "Stream goals are publicly readable" ON public.tank_stream_goals;
CREATE POLICY "Stream goals are publicly readable"
  ON public.tank_stream_goals FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins and service role manage stream goals" ON public.tank_stream_goals;
CREATE POLICY "Admins and service role manage stream goals"
  ON public.tank_stream_goals FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

DROP TRIGGER IF EXISTS tank_stream_goals_touch_updated_at ON public.tank_stream_goals;
CREATE TRIGGER tank_stream_goals_touch_updated_at
  BEFORE UPDATE ON public.tank_stream_goals
  FOR EACH ROW EXECUTE FUNCTION public.tank_touch_updated_at();

COMMENT ON TABLE public.tank_stream_goals IS
  'Stream goal bars for the /obs/goal overlay. Publicly readable because an OBS browser source is unauthenticated and the bar is on screen anyway. source names where current_value comes from; manual and viewers work without any provider connected.';

COMMENT ON COLUMN public.tank_stream_goals.source IS
  'manual | viewers | followers | drops | tavern. followers requires a connected provider in tank_chat_provider_connections.';

-- One ready-to-edit goal so the console has something to show and the overlay
-- has something to draw. Inactive: nothing appears on air until staff turn it on.
INSERT INTO public.tank_stream_goals (label, source, target, current_value, is_active, sort_order)
VALUES ('Follower goal', 'manual', 254, 243, false, 0)
ON CONFLICT DO NOTHING;
