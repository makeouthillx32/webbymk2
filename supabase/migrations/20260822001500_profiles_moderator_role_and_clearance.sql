-- Add 'moderator' to profiles_role_check and add clearance_level numeric column

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'moderator'::text, 'member'::text, 'guest'::text, 'researcher'::text, 'affiliate'::text]));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clearance_level INTEGER DEFAULT 1;

UPDATE public.profiles
SET clearance_level = CASE
  WHEN role = 'admin' THEN 3
  WHEN role = 'moderator' THEN 2
  ELSE 1
END;
