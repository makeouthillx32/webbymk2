-- Migration: tank_overlay_system
-- Generic browser-overlay scenes (OBS browser sources, same idea as
-- /obs/director's query-param generator, but driven by live Realtime
-- broadcast events instead of static config) plus a trigger system that
-- fires them either on a cron schedule or on an app-level "action" key
-- (e.g. a Tank signup). All reads/writes go through server actions using
-- the service-role admin client (src/zones/tank/server/overlays.ts) — no
-- public RLS policies, same pattern as tank_audio_requests.

CREATE TABLE IF NOT EXISTS public.tank_overlay_scenes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sound_key TEXT,
  display_seconds INT NOT NULL DEFAULT 6,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tank_overlay_triggers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scene_id UUID NOT NULL REFERENCES public.tank_overlay_scenes(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('cron', 'action')),
  action_key TEXT,
  cron_expression TEXT,
  message TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  cron_job_name TEXT,
  last_fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tank_overlay_trigger_shape CHECK (
    (trigger_type = 'cron' AND cron_expression IS NOT NULL) OR
    (trigger_type = 'action' AND action_key IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS tank_overlay_triggers_action_key_idx
  ON public.tank_overlay_triggers (action_key) WHERE trigger_type = 'action';

ALTER TABLE public.tank_overlay_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_overlay_triggers ENABLE ROW LEVEL SECURITY;

-- Called by a scheduled pg_cron job (one per cron-type trigger, registered
-- via tank_schedule_overlay_trigger below). Deliberately takes only the
-- trigger's UUID — never user-authored text — so nothing user-controlled
-- ever needs to be interpolated into the cron job's SQL body itself; the
-- webhook looks up the current message/scene fresh at fire time.
CREATE OR REPLACE FUNCTION public.tank_run_overlay_cron_trigger(p_trigger_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM net.http_post(
    url := 'http://unt_app:3000/api/webhooks/overlay-fire',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Shared secret with TANK_OVERLAY_WEBHOOK_SECRET in .env — rotate
      -- both together if this ever needs to change.
      'Authorization', 'Bearer 4a2da17b3f900a68f2d71056c2ba5463a8397b8d674cf1bd39138a44afb645ef'
    ),
    body := jsonb_build_object('triggerId', p_trigger_id::text)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net;

-- Registers (or re-registers) the pg_cron job for a cron-type trigger.
-- Called from createOverlayTrigger/toggleOverlayTrigger via admin.rpc().
CREATE OR REPLACE FUNCTION public.tank_schedule_overlay_trigger(p_trigger_id UUID, p_cron_expr TEXT)
RETURNS TEXT AS $$
DECLARE
  v_job_name TEXT := 'tank_overlay_trg_' || replace(p_trigger_id::text, '-', '_');
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job_name) THEN
    PERFORM cron.unschedule(v_job_name);
  END IF;
  PERFORM cron.schedule(
    v_job_name,
    p_cron_expr,
    format('SELECT public.tank_run_overlay_cron_trigger(%L::uuid);', p_trigger_id)
  );
  RETURN v_job_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron;

CREATE OR REPLACE FUNCTION public.tank_unschedule_overlay_trigger(p_job_name TEXT)
RETURNS VOID AS $$
BEGIN
  IF p_job_name IS NOT NULL AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = p_job_name) THEN
    PERFORM cron.unschedule(p_job_name);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron;
