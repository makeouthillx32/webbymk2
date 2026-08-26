-- Migration: tank_default_avatar_function
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Ensure tank_profiles has an avatar_url column with standard default.
-- 2. Update profiles table to normalize any old cloud avatar URLs or NULLs.
-- 3. Create a Supabase function + trigger for auto-assigning default avatar
--    to all new and existing Tank users.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Add avatar_url column to tank_profiles if not exists
ALTER TABLE public.tank_profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT 'https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png';

-- 2. Update existing NULL or deprecated avatar URLs in public.tank_profiles
UPDATE public.tank_profiles
SET avatar_url = 'https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png'
WHERE avatar_url IS NULL OR avatar_url = '' OR avatar_url LIKE '%supabase.co%';

-- 3. Update existing NULL or deprecated avatar URLs in public.profiles
UPDATE public.profiles
SET avatar_url = 'https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png'
WHERE avatar_url IS NULL OR avatar_url = '' OR avatar_url LIKE '%supabase.co%';

-- 4. Database Function: handle_new_tank_user_avatar
CREATE OR REPLACE FUNCTION public.handle_new_tank_user_avatar()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.avatar_url IS NULL OR NEW.avatar_url = '' OR NEW.avatar_url LIKE '%supabase.co%' THEN
    NEW.avatar_url := 'https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger on tank_profiles before insert/update
DROP TRIGGER IF EXISTS trg_tank_profiles_default_avatar ON public.tank_profiles;
CREATE TRIGGER trg_tank_profiles_default_avatar
BEFORE INSERT OR UPDATE OF avatar_url ON public.tank_profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_tank_user_avatar();

-- 6. Trigger on public.profiles before insert/update
DROP TRIGGER IF EXISTS trg_profiles_default_avatar ON public.profiles;
CREATE TRIGGER trg_profiles_default_avatar
BEFORE INSERT OR UPDATE OF avatar_url ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_tank_user_avatar();

-- 7. Trigger on auth.users registration to automatically seed tank_profiles with default avatar
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_tank_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.tank_profiles (user_id, display_name, xp, level, tokens, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'TankMember'),
    0,
    1,
    0,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET avatar_url = COALESCE(public.tank_profiles.avatar_url, 'https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_on_auth_user_created_tank ON auth.users;
CREATE TRIGGER trg_on_auth_user_created_tank
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user_tank_profile();
