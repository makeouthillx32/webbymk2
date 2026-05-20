-- ============================================================
-- Migration: switch_active_environment RPC
--
-- Replaces the two-step PATCH footgun in environment-store.ts
-- with an atomic Postgres function.
--
-- The footgun:
--   PATCH /environments?id=neq.…  { active: false }   ← step 1
--   PATCH /environments?id=eq.…   { active: true }    ← step 2
--
--   If step 1 succeeds and step 2 fails, there is NO active
--   environment. The TUI is now lying to the operator about
--   current infra state and every env-sensitive operation is
--   targeting the wrong host.
--
-- The fix:
--   POST /rpc/switch_active_environment { "target_id": "…" }
--
--   PostgREST wraps RPC calls in a transaction. Both UPDATEs
--   run in the same transaction context — if the second fails,
--   the whole thing rolls back. The partial unique index
--   (WHERE active = true) is never violated because the window
--   where active is false for all rows is inside the transaction
--   and never visible to other readers at READ COMMITTED or higher.
--
-- Calling convention (from environment-store.ts):
--   POST <kong>/rest/v1/rpc/switch_active_environment
--   Content-Type: application/json
--   Prefer: return=representation
--   Body: { "target_id": "<uuid>" }
--
--   Returns: the newly active environments row as JSON array.
-- ============================================================

-- ── Function ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.switch_active_environment(target_id uuid)
RETURNS SETOF public.environments
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Clear active flag on all rows except the target.
  -- Using id <> target_id instead of active = true so the UPDATE is safe
  -- even if the target is already active (idempotent).
  UPDATE public.environments
    SET    active = false
  WHERE  active = true
    AND  id <> target_id;

  -- Activate the target row and return it.
  UPDATE public.environments
    SET    active = true
  WHERE  id = target_id
  RETURNING *;
$$;

-- ── Permissions ───────────────────────────────────────────────────────────────

-- Revoke from PUBLIC so unauthenticated callers cannot invoke it.
REVOKE ALL ON FUNCTION public.switch_active_environment(uuid) FROM PUBLIC;

-- Grant only to service_role — the TUI uses the service key.
GRANT EXECUTE ON FUNCTION public.switch_active_environment(uuid) TO service_role;

-- ── Comment ───────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.switch_active_environment(uuid) IS
  'Atomically clears active=true from all environments and sets active=true '
  'on the target row. Called by environment-store.ts setActiveEnvironment(). '
  'Returns the newly active environment record. '
  'Replaces the two-step PATCH approach which had a failure window where '
  'no environment was active.';
