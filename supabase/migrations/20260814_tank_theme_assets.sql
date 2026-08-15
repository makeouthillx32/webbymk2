-- Migration: 20260814_tank_theme_assets.sql
-- Description: Hot-swappable visual theme registry for the Tank zone.
-- Assets (images + fonts) live in Supabase Storage (public `site-assets`
-- bucket, path `tank-theme/<theme-id>/...`); this table set is the DB-backed
-- manifest so the active theme/"vibe" can eventually be swapped from the
-- admin console instead of by editing src/zones/tank/theme.ts.
--
-- Applied through the local self-hosted Supabase MCP on 2026-08-13 after
-- repairing the read-only MCP role. Verification found 1 seeded theme,
-- 16 assets, RLS enabled on both tables, 4 policies, and a recorded
-- `tank_theme_assets` migration. src/zones/tank/theme.ts still provides a
-- compile-time fallback while the runtime theme adapter is being connected.

CREATE TABLE IF NOT EXISTS public.tank_themes (
  id TEXT PRIMARY KEY, -- e.g. 'fishtank-arcade'
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active theme at a time.
CREATE UNIQUE INDEX IF NOT EXISTS tank_themes_single_active
  ON public.tank_themes ((is_active))
  WHERE is_active;

CREATE TABLE IF NOT EXISTS public.tank_theme_assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  theme_id TEXT NOT NULL REFERENCES public.tank_themes(id) ON DELETE CASCADE,
  asset_key TEXT NOT NULL, -- e.g. 'background', 'button-blue', 'font-display'
  kind TEXT NOT NULL CHECK (kind IN ('image', 'font')),
  storage_bucket TEXT NOT NULL DEFAULT 'site-assets',
  storage_path TEXT NOT NULL, -- path inside the bucket
  public_url TEXT NOT NULL,
  format TEXT, -- e.g. 'png', 'webp', 'truetype', 'woff'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (theme_id, asset_key)
);

ALTER TABLE public.tank_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_theme_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view themes"
  ON public.tank_themes
  FOR SELECT
  USING (true);

CREATE POLICY "Admins and service role manage tank_themes"
  ON public.tank_themes
  FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() ->> 'role') = 'service_role'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Public can view theme assets"
  ON public.tank_theme_assets
  FOR SELECT
  USING (true);

CREATE POLICY "Admins and service role manage tank_theme_assets"
  ON public.tank_theme_assets
  FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() ->> 'role') = 'service_role'
    OR auth.role() = 'service_role'
  );

CREATE OR REPLACE FUNCTION public.update_tank_themes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_tank_themes_updated_at ON public.tank_themes;
CREATE TRIGGER set_tank_themes_updated_at
  BEFORE UPDATE ON public.tank_themes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tank_themes_updated_at();

-- Seed: the "Fishtank Arcade" theme, pulled from the scraped fishtank.live
-- asset dump (Z:\WEBSITES\webbymk2\.tmp\tank_image_dump). Uploaded to
-- Supabase Storage under site-assets/tank-theme/fishtank-arcade/... —
-- deliberately excludes their logo.png (not ours to serve/redistribute).
INSERT INTO public.tank_themes (id, label, is_active) VALUES
  ('fishtank-arcade', 'Arcade Console', true)
ON CONFLICT (id) DO UPDATE SET is_active = EXCLUDED.is_active;

INSERT INTO public.tank_theme_assets (theme_id, asset_key, kind, storage_path, public_url, format) VALUES
  ('fishtank-arcade', 'background', 'image', 'tank-theme/fishtank-arcade/images/green-bg.png', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/green-bg.png', 'png'),
  ('fishtank-arcade', 'button-blue', 'image', 'tank-theme/fishtank-arcade/images/console-button-long-blue.png', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/console-button-long-blue.png', 'png'),
  ('fishtank-arcade', 'button-gray', 'image', 'tank-theme/fishtank-arcade/images/console-button-long-gray.png', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/console-button-long-gray.png', 'png'),
  ('fishtank-arcade', 'button-orange', 'image', 'tank-theme/fishtank-arcade/images/console-button-long-orange.png', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/console-button-long-orange.png', 'png'),
  ('fishtank-arcade', 'button-red', 'image', 'tank-theme/fishtank-arcade/images/console-button-long-red.png', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/console-button-long-red.png', 'png'),
  ('fishtank-arcade', 'texture-aluminum', 'image', 'tank-theme/fishtank-arcade/images/light-aluminum-comp.webp', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/light-aluminum-comp.webp', 'webp'),
  ('fishtank-arcade', 'texture-metal', 'image', 'tank-theme/fishtank-arcade/images/metal-small-comp.webp', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/metal-small-comp.webp', 'webp'),
  ('fishtank-arcade', 'screw-top-left', 'image', 'tank-theme/fishtank-arcade/images/screw-top-left.png', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/screw-top-left.png', 'png'),
  ('fishtank-arcade', 'screw-top-right', 'image', 'tank-theme/fishtank-arcade/images/screw-top-right.png', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/screw-top-right.png', 'png'),
  ('fishtank-arcade', 'screw-bottom-left', 'image', 'tank-theme/fishtank-arcade/images/screw-bottom-left.png', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/screw-bottom-left.png', 'png'),
  ('fishtank-arcade', 'screw-bottom-right', 'image', 'tank-theme/fishtank-arcade/images/screw-bottom-right.png', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/screw-bottom-right.png', 'png'),
  ('fishtank-arcade', 'font-display', 'font', 'tank-theme/fishtank-arcade/fonts/alarmclock.ttf', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/fonts/alarmclock.ttf', 'truetype'),
  ('fishtank-arcade', 'font-dot-matrix', 'font', 'tank-theme/fishtank-arcade/fonts/5x5-Dots.woff', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/fonts/5x5-Dots.woff', 'woff'),
  ('fishtank-arcade', 'font-label', 'font', 'tank-theme/fishtank-arcade/fonts/highway_gothic.ttf', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/fonts/highway_gothic.ttf', 'truetype'),
  ('fishtank-arcade', 'font-label-wide', 'font', 'tank-theme/fishtank-arcade/fonts/highway_gothic_wide.ttf', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/fonts/highway_gothic_wide.ttf', 'truetype'),
  ('fishtank-arcade', 'font-stamp', 'font', 'tank-theme/fishtank-arcade/fonts/army.ttf', 'https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/fonts/army.ttf', 'truetype')
ON CONFLICT (theme_id, asset_key) DO UPDATE SET
  storage_path = EXCLUDED.storage_path,
  public_url = EXCLUDED.public_url,
  format = EXCLUDED.format;
