-- ============================================================================
-- TANK DATABASE TRIGGERS & RPC STORED PROCEDURES (db.unenter.live)
-- High-Performance Backend Database Logic for Realtime Gaming & Economy
-- ============================================================================

-- 1. Atomic Item Usage RPC Function
-- Deducts inventory item, awards XP/Tokens, computes Level, and writes to chat
CREATE OR REPLACE FUNCTION public.tank_use_inventory_item(
  p_user_id UUID,
  p_item_slug TEXT,
  p_room_id TEXT DEFAULT 'global'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id UUID;
  v_item_name TEXT;
  v_action_text TEXT;
  v_reward_xp INT := 25;
  v_reward_tokens INT := 10;
  v_user_name TEXT;
  v_user_role TEXT;
  v_current_qty INT;
  v_new_xp INT;
  v_new_tokens INT;
  v_new_level INT;
  v_inserted_msg_id UUID;
BEGIN
  -- Resolve User Name & Role
  SELECT 
    COALESCE(display_name, username, 'Viewer'),
    COALESCE(role, 'member')
  INTO v_user_name, v_user_role
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_user_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Resolve Item Details
  SELECT id, name, COALESCE(action_text, 'used an item in the room!'), COALESCE(reward_xp, 25), COALESCE(reward_tokens, 10)
  INTO v_item_id, v_item_name, v_action_text, v_reward_xp, v_reward_tokens
  FROM public.tank_items
  WHERE slug = p_item_slug;

  IF v_item_name IS NULL THEN
    -- Fallback for built-in items like pumpkin
    IF p_item_slug = 'pumpkin' THEN
      v_item_name := 'Pumpkin';
      v_action_text := 'lands a devastating kick on their pumpkin! Orange goo and seeds go flying!!!';
      v_reward_xp := 40;
      v_reward_tokens := 25;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Unknown item slug');
    END IF;
  END IF;

  -- Check and decrement inventory if item exists in DB
  IF v_item_id IS NOT NULL THEN
    SELECT quantity INTO v_current_qty
    FROM public.tank_player_inventory
    WHERE user_id = p_user_id AND item_id = v_item_id;

    IF v_current_qty IS NULL OR v_current_qty <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Item not in inventory');
    END IF;

    IF v_current_qty = 1 THEN
      DELETE FROM public.tank_player_inventory WHERE user_id = p_user_id AND item_id = v_item_id;
    ELSE
      UPDATE public.tank_player_inventory SET quantity = quantity - 1 WHERE user_id = p_user_id AND item_id = v_item_id;
    END IF;
  END IF;

  -- Award Profile Rewards & Compute Level in Postgres
  UPDATE public.tank_profiles
  SET 
    xp = COALESCE(xp, 0) + v_reward_xp,
    tokens = COALESCE(tokens, 0) + v_reward_tokens,
    level = GREATEST(1, FLOOR(SQRT((COALESCE(xp, 0) + v_reward_xp) / 10)) + 1),
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING xp, tokens, level INTO v_new_xp, v_new_tokens, v_new_level;

  -- Insert chat message (automatically triggers Realtime broadcast to room subscribers)
  INSERT INTO public.tank_chat_messages (
    room_id,
    user_id,
    user_name,
    user_role,
    body,
    message_type,
    item_slug,
    created_at
  ) VALUES (
    p_room_id,
    p_user_id,
    v_user_name,
    v_user_role,
    v_user_name || ' ' || v_action_text,
    'item_use',
    p_item_slug,
    NOW()
  ) RETURNING id INTO v_inserted_msg_id;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', v_inserted_msg_id,
    'item_name', v_item_name,
    'reward_xp', v_reward_xp,
    'reward_tokens', v_reward_tokens,
    'new_xp', v_new_xp,
    'new_tokens', v_new_tokens,
    'new_level', v_new_level
  );
END;
$$;


-- 2. Chat Message Activity Trigger
-- Runs on every inserted message to award base chatter XP and track daily missions
CREATE OR REPLACE FUNCTION public.handle_tank_chat_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_level INT;
  v_new_level INT;
BEGIN
  -- Ignore automated bot / system messages
  IF NEW.user_id IS NULL OR NEW.message_type = 'system' THEN
    RETURN NEW;
  END IF;

  -- Fetch existing level
  SELECT level INTO v_old_level
  FROM public.tank_profiles
  WHERE user_id = NEW.user_id;

  -- Award 5 Base Chatter XP
  UPDATE public.tank_profiles
  SET 
    xp = COALESCE(xp, 0) + 5,
    level = GREATEST(1, FLOOR(SQRT((COALESCE(xp, 0) + 5) / 10)) + 1),
    updated_at = NOW()
  WHERE user_id = NEW.user_id
  RETURNING level INTO v_new_level;

  -- Check if user Leveled Up -> Automatically post [LEVEL UP] announcement
  IF v_new_level > COALESCE(v_old_level, 1) THEN
    INSERT INTO public.tank_chat_messages (
      room_id,
      user_id,
      user_name,
      user_role,
      body,
      message_type,
      created_at
    ) VALUES (
      NEW.room_id,
      NULL,
      'SYSTEM',
      'admin',
      '🎉 [LEVEL UP] ' || NEW.user_name || ' just reached LEVEL ' || v_new_level || '!',
      'level_up',
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Bind trigger to tank_chat_messages
DROP TRIGGER IF EXISTS trg_tank_chat_message_insert ON public.tank_chat_messages;
CREATE TRIGGER trg_tank_chat_message_insert
AFTER INSERT ON public.tank_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.handle_tank_chat_message_insert();


-- 3. Daily Claim & Streak Engine
-- The durable, least-privilege definition lives in the forward migration:
-- supabase/migrations/20260821191930_tank_daily_login_streak.sql
-- Keep it out of this legacy bundle so re-running this file cannot restore the
-- old anonymous SECURITY DEFINER RPC or its obsolete seven-day wraparound.
