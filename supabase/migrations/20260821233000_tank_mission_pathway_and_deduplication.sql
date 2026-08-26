-- Migration: tank_mission_pathway_and_deduplication
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Deduplicate tank_missions and add unique key & category columns.
-- 2. Populate clear, fun Starter & Chatter Pathway missions.
-- 3. Atomic mission progress tracker with instant reward payout.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Alter table to support unique mission keys and categories
ALTER TABLE public.tank_missions
ADD COLUMN IF NOT EXISTS key TEXT,
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'starter';

-- 2. Clear old duplicate missions and progress
DELETE FROM public.tank_mission_progress;
DELETE FROM public.tank_missions;

-- 3. Ensure unique constraint on key
ALTER TABLE public.tank_missions
DROP CONSTRAINT IF EXISTS tank_missions_key_unique;
ALTER TABLE public.tank_missions
ADD CONSTRAINT tank_missions_key_unique UNIQUE (key);

-- 4. Insert authentic Starter & Chatter Mission Pathway
INSERT INTO public.tank_missions (key, category, title, description, reward_tokens, reward_xp, target_count, sort_order, is_active)
VALUES
  (
    'sign_in_first_time',
    'starter',
    'Sign in for the first time',
    'Create your Tank account and sign in to the live house.',
    10,
    25,
    1,
    1,
    true
  ),
  (
    'watch_live_camera',
    'starter',
    'Watch a live camera',
    'Open any house room and watch a live camera feed.',
    10,
    25,
    1,
    2,
    true
  ),
  (
    'post_first_message',
    'starter',
    'Post your first chat message',
    'Say hello to everyone in global live chat.',
    15,
    50,
    1,
    3,
    true
  ),
  (
    'type_t_20_times',
    'chatter',
    'Press T for Tank (20x)',
    'Type the letter T (or send messages containing T) 20 times in chat!',
    20,
    50,
    20,
    4,
    true
  ),
  (
    'roll_luck_game',
    'chatter',
    'Test Your Luck (/roll or /flip)',
    'Play any chat minigame like /roll 100 or /flip in chat.',
    15,
    40,
    1,
    5,
    true
  ),
  (
    'use_first_item',
    'starter',
    'Use an Inventory Item',
    'Open your inventory and activate any consumable item or gadget.',
    25,
    75,
    1,
    6,
    true
  ),
  (
    'find_scavenger_target',
    'explorer',
    'House Scavenger Hunt',
    'Spot and tap an interactive scavenger item on any live camera feed.',
    30,
    100,
    1,
    7,
    true
  )
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  reward_tokens = EXCLUDED.reward_tokens,
  reward_xp = EXCLUDED.reward_xp,
  target_count = EXCLUDED.target_count,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- 5. Atomic Progress Tracker & Auto-Completer Function
CREATE OR REPLACE FUNCTION public.tank_record_mission_progress(
  p_user_id UUID,
  p_mission_key TEXT,
  p_increment INT DEFAULT 1
)
RETURNS JSONB AS $$
DECLARE
  v_mission public.tank_missions%ROWTYPE;
  v_progress_row public.tank_mission_progress%ROWTYPE;
  v_new_progress INT;
  v_is_completed BOOLEAN := false;
  v_just_completed BOOLEAN := false;
BEGIN
  -- Get active mission
  SELECT * INTO v_mission
  FROM public.tank_missions
  WHERE key = p_mission_key AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mission not found or inactive');
  END IF;

  -- Upsert progress
  INSERT INTO public.tank_mission_progress (mission_id, user_id, progress, completed_at)
  VALUES (
    v_mission.id,
    p_user_id,
    LEAST(v_mission.target_count, p_increment),
    CASE WHEN p_increment >= v_mission.target_count THEN NOW() ELSE NULL END
  )
  ON CONFLICT (mission_id, user_id) DO UPDATE
  SET
    progress = LEAST(v_mission.target_count, public.tank_mission_progress.progress + p_increment),
    completed_at = CASE
      WHEN public.tank_mission_progress.completed_at IS NOT NULL THEN public.tank_mission_progress.completed_at
      WHEN (public.tank_mission_progress.progress + p_increment) >= v_mission.target_count THEN NOW()
      ELSE NULL
    END
  RETURNING * INTO v_progress_row;

  -- Check if just completed right now
  IF v_progress_row.completed_at IS NOT NULL AND v_progress_row.progress >= v_mission.target_count THEN
    -- Grant rewards only if not granted before
    IF v_progress_row.completed_at >= (NOW() - INTERVAL '5 seconds') THEN
      v_just_completed := true;

      -- Tokens
      IF v_mission.reward_tokens > 0 THEN
        INSERT INTO public.tank_token_transactions (user_id, amount, reason)
        VALUES (p_user_id, v_mission.reward_tokens, 'mission:' || v_mission.title);
        
        UPDATE public.tank_profiles
        SET tokens = tokens + v_mission.reward_tokens
        WHERE user_id = p_user_id;
      END IF;

      -- XP
      IF v_mission.reward_xp > 0 THEN
        UPDATE public.tank_profiles
        SET xp = xp + v_mission.reward_xp
        WHERE user_id = p_user_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'missionKey', v_mission.key,
    'progress', v_progress_row.progress,
    'target', v_mission.target_count,
    'completed', v_progress_row.completed_at IS NOT NULL,
    'justCompleted', v_just_completed,
    'rewardTokens', v_mission.reward_tokens,
    'rewardXp', v_mission.reward_xp
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.tank_record_mission_progress(UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tank_record_mission_progress(UUID, TEXT, INT) TO service_role;
