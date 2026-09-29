-- Migration: 20260912230000_tank_overlay_settings.sql
-- Description: Durable, staff-editable settings for the OBS overlay browser
-- sources, so a source URL can be pasted into OBS ONCE and then reconfigured
-- from the staff console forever after.
--
-- The problem this solves: every overlay setting used to live in the query
-- string. That makes the URL the configuration, which is honest but means
-- changing a caption requires editing the URL in OBS and reloading the source.
-- For an operator running a 24/7 broadcast that is the wrong trade — the URL
-- should be a stable address, not a config file.
--
-- Precedence, decided deliberately and implemented in overlaySettings.ts:
--
--     query parameter  >  stored setting  >  built-in default
--
-- The query parameter still wins. That keeps every URL already pasted into OBS
-- working exactly as it does today, and leaves an escape hatch for a one-off
-- source that must NOT follow the shared configuration (a second scene with a
-- different caption, say). Storage is the new default layer, not a new master.

CREATE TABLE IF NOT EXISTS public.tank_overlay_settings (
  -- One row per overlay. Matches DirectorOverlayId in
  -- src/zones/tank/house/directorOverlayWorkshop.ts plus 'director' for the
  -- composed programme page. A bare string rather than an enum because the
  -- overlay catalogue is code and gains entries without a migration; the write
  -- API validates against that catalogue so a typo cannot land here.
  overlay_id TEXT PRIMARY KEY,

  -- The settings themselves: exactly the shape the workshop edits, e.g.
  -- {"label": "LIVE FROM THE KITCHEN", "duration": 400}. Unknown keys are
  -- ignored on read rather than rejected, so rolling back a deploy that added a
  -- field cannot brick an overlay.
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,

  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tank_overlay_settings_object_check
    CHECK (jsonb_typeof(settings) = 'object')
);

ALTER TABLE public.tank_overlay_settings ENABLE ROW LEVEL SECURITY;

-- PUBLIC READ is intentional and required.
--
-- An OBS browser source is an unauthenticated browser. It has no session and
-- cannot be given one — pasting a credential into a URL that lives in a stream
-- config is worse than anything this table contains. What it contains is
-- cosmetic: caption text, toggle states, effect timings. Nothing here is a
-- secret, and nothing here reveals anything about the house that the stream
-- itself does not already show.
--
-- Writes remain staff-only, through the service role.
DROP POLICY IF EXISTS "Overlay settings are publicly readable" ON public.tank_overlay_settings;
CREATE POLICY "Overlay settings are publicly readable"
  ON public.tank_overlay_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins and service role write overlay settings" ON public.tank_overlay_settings;
CREATE POLICY "Admins and service role write overlay settings"
  ON public.tank_overlay_settings FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

DROP TRIGGER IF EXISTS tank_overlay_settings_touch_updated_at
  ON public.tank_overlay_settings;
CREATE TRIGGER tank_overlay_settings_touch_updated_at
  BEFORE UPDATE ON public.tank_overlay_settings
  FOR EACH ROW EXECUTE FUNCTION public.tank_touch_updated_at();

COMMENT ON TABLE public.tank_overlay_settings IS
  'Staff-editable settings for OBS overlay browser sources, so a source URL is pasted once and reconfigured from the console afterwards. Publicly readable because an OBS browser source is unauthenticated; contents are cosmetic only. Precedence: query parameter > stored setting > default.';

-- Seed a row per overlay so the console always has something to edit and the
-- overlays always get a definite answer instead of a 404 they have to
-- interpret. Empty settings mean "use the defaults", which is the correct
-- starting state.
INSERT INTO public.tank_overlay_settings (overlay_id, settings)
VALUES
  ('director', '{}'::jsonb),
  ('hud', '{}'::jsonb),
  ('attention', '{}'::jsonb),
  ('vu', '{}'::jsonb),
  ('crt', '{}'::jsonb),
  ('audio', '{}'::jsonb)
ON CONFLICT (overlay_id) DO NOTHING;
