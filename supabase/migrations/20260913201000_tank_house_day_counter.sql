-- The public Tank house-day counter has its own anchor. It must not reuse or
-- mutate tank_seasons.starts_at because season dates also bound archives and
-- historical gameplay records.
INSERT INTO public.tank_platform_settings (key, value, updated_at)
VALUES (
  'tank_house_day_counter_v1',
  jsonb_build_object(
    'startedAt', NOW(),
    'resetToDay', 1
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;

-- Allow public read access to the house-day counter key so anonymous viewers
-- can calculate the public day on the Tank dashboard without RLS filtering.
DROP POLICY IF EXISTS "Public reads safe Tank settings" ON public.tank_platform_settings;
CREATE POLICY "Public reads safe Tank settings"
  ON public.tank_platform_settings FOR SELECT
  TO anon, authenticated
  USING (key IN ('launch_mode', 'sfx_enabled', 'tts_enabled', 'tank_house_day_counter_v1'));

