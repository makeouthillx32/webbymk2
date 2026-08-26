-- Real mission completion. tank_missions / tank_mission_progress were real,
-- read-only "bones" (20260814140000_tank_platform_bones.sql) — the UI could
-- display live mission state but nothing anywhere ever wrote a completion.
-- This adds the one write path: an atomic, idempotent, race-safe function
-- that marks a mission complete for a user and awards its token/XP reward
-- exactly once. Called from server/actions.ts#completeMission via the admin
-- client (service_role), never directly from the browser.

CREATE OR REPLACE FUNCTION public.tank_complete_mission(p_user_id uuid, p_mission_title text)
RETURNS jsonb AS $$
DECLARE
  v_mission_id uuid;
  v_reward_tokens integer;
  v_reward_xp integer;
  v_target_count integer;
  v_did_award integer;
BEGIN
  SELECT id, reward_tokens, reward_xp, target_count
  INTO v_mission_id, v_reward_tokens, v_reward_xp, v_target_count
  FROM public.tank_missions
  WHERE title = p_mission_title AND is_active
  LIMIT 1;

  IF v_mission_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mission not found.');
  END IF;

  -- Single atomic upsert guarded by "only if not already completed" — the
  -- affected-row count (not a separate pre-check SELECT) is what decides
  -- whether a reward is granted, so two concurrent calls can never both
  -- award the same completion.
  WITH upsert AS (
    INSERT INTO public.tank_mission_progress (mission_id, user_id, progress, completed_at)
    VALUES (v_mission_id, p_user_id, v_target_count, NOW())
    ON CONFLICT (mission_id, user_id)
    DO UPDATE SET progress = EXCLUDED.progress, completed_at = EXCLUDED.completed_at
    WHERE public.tank_mission_progress.completed_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_did_award FROM upsert;

  IF v_did_award = 0 THEN
    RETURN jsonb_build_object('success', true, 'alreadyCompleted', true);
  END IF;

  IF v_reward_tokens > 0 THEN
    INSERT INTO public.tank_token_transactions (user_id, amount, reason)
    VALUES (p_user_id, v_reward_tokens, 'mission:' || p_mission_title);
  END IF;

  IF v_reward_xp > 0 THEN
    UPDATE public.tank_profiles SET xp = xp + v_reward_xp WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'alreadyCompleted', false,
    'rewardTokens', v_reward_tokens,
    'rewardXp', v_reward_xp
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.tank_complete_mission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tank_complete_mission(uuid, text) TO service_role;
