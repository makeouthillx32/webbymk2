-- ─── Analytics Tables Migration ─────────────────────────────────────────────
-- Run this in Supabase Studio → SQL Editor, or via psql against your local DB.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── analytics_users ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  text NOT NULL,
  user_agent  text,
  ip_address  text,
  device_type text,
  browser     text,
  os          text,
  is_bot      boolean DEFAULT false,
  screen_width  integer,
  screen_height integer,
  language    text,
  timezone    text,
  last_seen   timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_users_session_id_idx
  ON public.analytics_users (session_id);

CREATE INDEX IF NOT EXISTS analytics_users_created_at_idx
  ON public.analytics_users (created_at DESC);

-- ─── analytics_sessions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   text NOT NULL,
  user_id      uuid REFERENCES public.analytics_users (id) ON DELETE CASCADE,
  entry_page   text,
  exit_page    text,
  device_type  text,
  browser      text,
  os           text,
  referrer     text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  start_time   timestamptz DEFAULT now(),
  end_time     timestamptz,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_sessions_session_id_idx
  ON public.analytics_sessions (session_id);

CREATE INDEX IF NOT EXISTS analytics_sessions_user_id_idx
  ON public.analytics_sessions (user_id);

CREATE INDEX IF NOT EXISTS analytics_sessions_created_at_idx
  ON public.analytics_sessions (created_at DESC);

-- ─── analytics_page_views ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_page_views (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES public.analytics_users (id) ON DELETE CASCADE,
  session_id   text NOT NULL,
  page_url     text NOT NULL,
  page_title   text,
  referrer     text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_term     text,
  utm_content  text,
  load_time    integer,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_page_views_session_id_idx
  ON public.analytics_page_views (session_id);

CREATE INDEX IF NOT EXISTS analytics_page_views_user_id_idx
  ON public.analytics_page_views (user_id);

CREATE INDEX IF NOT EXISTS analytics_page_views_page_url_idx
  ON public.analytics_page_views (page_url);

CREATE INDEX IF NOT EXISTS analytics_page_views_created_at_idx
  ON public.analytics_page_views (created_at DESC);

-- ─── analytics_events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES public.analytics_users (id) ON DELETE CASCADE,
  session_id     text NOT NULL,
  event_name     text NOT NULL,
  event_category text,
  event_action   text,
  event_label    text,
  event_value    numeric,
  page_url       text,
  metadata       jsonb,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx
  ON public.analytics_events (session_id);

CREATE INDEX IF NOT EXISTS analytics_events_event_name_idx
  ON public.analytics_events (event_name);

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON public.analytics_events (created_at DESC);

-- ─── analytics_device_stats ──────────────────────────────────────────────────
-- Aggregated daily device breakdown (populated by a cron job or trigger).
CREATE TABLE IF NOT EXISTS public.analytics_device_stats (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date           date NOT NULL,
  device_type    text NOT NULL,
  sessions_count integer DEFAULT 0,
  users_count    integer DEFAULT 0,
  bounce_rate    numeric DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (date, device_type)
);

CREATE INDEX IF NOT EXISTS analytics_device_stats_date_idx
  ON public.analytics_device_stats (date DESC);

-- ─── analytics_daily_stats ────────────────────────────────────────────────────
-- Aggregated daily metrics (unique_users, sessions, etc.).
CREATE TABLE IF NOT EXISTS public.analytics_daily_stats (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date         date NOT NULL,
  metric_type  text NOT NULL,
  metric_value numeric DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (date, metric_type)
);

CREATE INDEX IF NOT EXISTS analytics_daily_stats_date_idx
  ON public.analytics_daily_stats (date DESC);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Analytics data is written server-side (service role) and read by authenticated
-- dashboard users. Adjust policies to match your dashboard auth requirements.

ALTER TABLE public.analytics_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_device_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_daily_stats  ENABLE ROW LEVEL SECURITY;

-- Service role bypass (server-side API routes use the service key).
-- The "authenticated" role can SELECT for dashboard reads.

CREATE POLICY "service role full access" ON public.analytics_users
  USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON public.analytics_sessions
  USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON public.analytics_page_views
  USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON public.analytics_events
  USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON public.analytics_device_stats
  USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON public.analytics_daily_stats
  USING (true) WITH CHECK (true);
