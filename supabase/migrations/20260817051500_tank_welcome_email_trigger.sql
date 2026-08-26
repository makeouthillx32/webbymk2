-- Migration: tank_welcome_email_trigger
-- Fires a "Welcome to Tank" email the moment a profile gets a tank_profiles
-- row — a fresh Tank signup, OR an existing shop/labs account picking up a
-- tank tag for the first time (tank_provision_profile already provisions
-- this row on both new-account and account-linking paths, see
-- 20260814140000_tank_platform_bones.sql). Async via pg_net — never blocks
-- the insert this fires from.

CREATE OR REPLACE FUNCTION public.tank_send_welcome_email()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'http://unt_app:3000/api/webhooks/tank-welcome',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Shared secret with TANK_WELCOME_WEBHOOK_SECRET in .env — rotate
      -- both together if this ever needs to change.
      'Authorization', 'Bearer 7db09b665faaf7254d559fa2ebc2aa9ecacfe5b47fc40fc74b11af66bfa21066'
    ),
    body := jsonb_build_object('user_id', NEW.user_id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net;

DROP TRIGGER IF EXISTS tank_welcome_email_on_profile_insert ON public.tank_profiles;
CREATE TRIGGER tank_welcome_email_on_profile_insert
  AFTER INSERT ON public.tank_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tank_send_welcome_email();
