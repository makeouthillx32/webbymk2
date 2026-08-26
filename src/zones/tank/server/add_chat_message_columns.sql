-- Migration: Add message_type, item_slug, and metadata to tank_chat_messages

ALTER TABLE public.tank_chat_messages
ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'chat',
ADD COLUMN IF NOT EXISTS item_slug text,
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Recreate trigger function with safe NULL checks
CREATE OR REPLACE FUNCTION handle_tank_chat_message_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_old_level integer;
  v_new_level integer;
  v_new_xp integer;
  v_user_name text;
BEGIN
  -- If system or anonymous message, skip leveling logic
  IF NEW.user_id IS NULL OR COALESCE(NEW.message_type, 'chat') = 'system' THEN
    RETURN NEW;
  END IF;

  -- 1. Fetch current profile
  SELECT xp, level, COALESCE(display_name, NEW.user_name)
  INTO v_new_xp, v_old_level, v_user_name
  FROM public.tank_profiles
  WHERE user_id = NEW.user_id;

  IF NOT FOUND THEN
    INSERT INTO public.tank_profiles (user_id, display_name, xp, level, tokens)
    VALUES (NEW.user_id, NEW.user_name, 5, 1, 0)
    RETURNING xp, level INTO v_new_xp, v_old_level;
  ELSE
    -- Add 5 XP per message
    v_new_xp := COALESCE(v_new_xp, 0) + 5;
    v_new_level := FLOOR(1 + SQRT(v_new_xp / 100));

    UPDATE public.tank_profiles
    SET xp = v_new_xp,
        level = v_new_level,
        updated_at = NOW()
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
