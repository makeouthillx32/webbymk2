-- Migration: 20260913170000_tank_manual_email_verification.sql
-- Description: Let staff mark an account's email verified — or un-verify it —
-- from the House console.
--
-- WHY A FUNCTION AND NOT THE ADMIN API. GoTrue's admin updateUserById accepts
-- `email_confirm: true` and will confirm an address, but there is no supported
-- way to UN-confirm one: passing false is a no-op. The only way back is to null
-- auth.users.email_confirmed_at directly, and the auth schema is not exposed
-- through PostgREST — so it needs a SECURITY DEFINER function.
--
-- confirmed_at is deliberately NOT touched. In current GoTrue it is a GENERATED
-- column (LEAST(email_confirmed_at, phone_confirmed_at)); writing to it raises.
--
-- THIS IS A PRIVILEGED ACTION. Marking an address verified asserts something
-- nobody proved: that the person controls that inbox. Done wrongly it hands an
-- account to whoever asked for it, so every call is written to admin_audit_log
-- by the caller, and execution is restricted to the service role.

CREATE OR REPLACE FUNCTION public.tank_set_email_verified(
  target_user_id UUID,
  verified BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
-- Pinned so a caller cannot shadow `auth` or `public` with their own schema and
-- have this function resolve to something else entirely.
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  touched BOOLEAN;
BEGIN
  -- Belt and braces alongside the GRANT below: a SECURITY DEFINER function that
  -- writes to auth.users must never rely on the grant alone.
  IF NOT (
    auth.role() = 'service_role'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  ) THEN
    RAISE EXCEPTION 'tank_set_email_verified: not authorised';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'tank_set_email_verified: target_user_id is required';
  END IF;

  UPDATE auth.users
  SET
    -- COALESCE on the way up: re-verifying an already-verified account must not
    -- move the original timestamp, which is the only record of when the person
    -- actually proved the address.
    email_confirmed_at = CASE
      WHEN verified THEN COALESCE(email_confirmed_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = target_user_id;

  GET DIAGNOSTICS touched = ROW_COUNT;
  RETURN touched;
END;
$$;

-- anon and authenticated must never reach this, or any signed-in visitor could
-- verify their own address and skip the email entirely.
REVOKE ALL ON FUNCTION public.tank_set_email_verified(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tank_set_email_verified(UUID, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.tank_set_email_verified(UUID, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tank_set_email_verified(UUID, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.tank_set_email_verified(UUID, BOOLEAN) IS
  'Staff override for auth.users.email_confirmed_at. Exists because GoTrue can confirm an address but cannot un-confirm one. service_role only; callers must write an admin_audit_log row.';
