-- Migration: tank_platform_bones
-- Real backing tables for Tank zone chat, platform settings, and the
-- gamification layer (profiles/XP/level, tokens ledger, clans, seasons,
-- missions, inventory, archives, leaderboard view). Everything here is
-- structural "bones" — seed data is limited to genuine config (season
-- definition, mission/item catalog rows), never fabricated user activity
-- (no fake clan members, no fake mission progress, no fake archive
-- episodes).

-- ─────────────────────────────────────────────────────────────────────────
-- Chat + platform settings (code in server/actions.ts already expects
-- these exact table/column names)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL DEFAULT 'viewer',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tank_chat_messages_room_id_created_at_idx
  ON public.tank_chat_messages (room_id, created_at);

ALTER TABLE public.tank_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read chat messages"
  ON public.tank_chat_messages FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can post their own chat messages"
  ON public.tank_chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins and service role manage chat messages"
  ON public.tank_chat_messages FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

CREATE TABLE IF NOT EXISTS public.tank_platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tank_platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read platform settings"
  ON public.tank_platform_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins and service role manage platform settings"
  ON public.tank_platform_settings FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

INSERT INTO public.tank_platform_settings (key, value)
VALUES ('launch_mode', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- Shared updated_at trigger helper
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tank_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────
-- Player profile: XP / level / token balance cache
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tank_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read player profiles"
  ON public.tank_profiles FOR SELECT
  USING (true);

CREATE POLICY "Admins and service role manage player profiles"
  ON public.tank_profiles FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

DROP TRIGGER IF EXISTS set_tank_profiles_updated_at ON public.tank_profiles;
CREATE TRIGGER set_tank_profiles_updated_at
  BEFORE UPDATE ON public.tank_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tank_touch_updated_at();

-- Simple, real leveling curve: level = floor(sqrt(xp / 100)) + 1.
-- (100 xp -> lvl 2, 400 xp -> lvl 3, 900 xp -> lvl 4, ...)
CREATE OR REPLACE FUNCTION public.tank_level_for_xp(xp_value INTEGER)
RETURNS INTEGER AS $$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(xp_value, 0) / 100.0))::INTEGER + 1);
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.tank_recompute_level()
RETURNS TRIGGER AS $$
BEGIN
  NEW.level = public.tank_level_for_xp(NEW.xp);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_tank_profiles_level ON public.tank_profiles;
CREATE TRIGGER set_tank_profiles_level
  BEFORE INSERT OR UPDATE OF xp ON public.tank_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tank_recompute_level();

-- Auto-provision a tank_profiles row whenever a profile gets linked to a
-- real auth account. public.profiles is shared across the whole platform
-- (guest checkout rows have auth_user_id = NULL — no auth.users row to
-- reference), so we key off auth_user_id, not profiles.id, and fire on
-- both insert and the later UPDATE that links a guest profile to an
-- account. Additive-only: does not touch the existing signup trigger.
CREATE OR REPLACE FUNCTION public.tank_provision_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.auth_user_id IS NOT NULL THEN
    INSERT INTO public.tank_profiles (user_id, display_name)
    VALUES (NEW.auth_user_id, NEW.display_name)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tank_provision_profile_on_signup ON public.profiles;
CREATE TRIGGER tank_provision_profile_on_signup
  AFTER INSERT OR UPDATE OF auth_user_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tank_provision_profile();

-- Backfill: every existing profile already linked to a real, still-extant
-- auth account gets a tank_profiles row too (guest/customer profiles with
-- no auth account are skipped; one known orphaned profile — auth_user_id
-- set but the auth.users row is gone — is also skipped rather than
-- failing the whole migration).
INSERT INTO public.tank_profiles (user_id, display_name)
SELECT p.auth_user_id, p.display_name
FROM public.profiles p
WHERE p.auth_user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p.auth_user_id)
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- Token ledger (source of truth) — tank_profiles.tokens is a fast cache
-- kept in sync by a trigger on insert.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tank_token_transactions_user_id_idx
  ON public.tank_token_transactions (user_id, created_at);

ALTER TABLE public.tank_token_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own token transactions"
  ON public.tank_token_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins and service role manage token transactions"
  ON public.tank_token_transactions FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

CREATE OR REPLACE FUNCTION public.tank_apply_token_transaction()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.tank_profiles
  SET tokens = tokens + NEW.amount
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS apply_tank_token_transaction ON public.tank_token_transactions;
CREATE TRIGGER apply_tank_token_transaction
  AFTER INSERT ON public.tank_token_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tank_apply_token_transaction();

-- ─────────────────────────────────────────────────────────────────────────
-- Clans
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_clans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL UNIQUE,
  description TEXT,
  banner_color TEXT NOT NULL DEFAULT '#3a3f2e',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tank_clans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read clans"
  ON public.tank_clans FOR SELECT
  USING (true);

CREATE POLICY "Admins and service role manage clans"
  ON public.tank_clans FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

CREATE TABLE IF NOT EXISTS public.tank_clan_members (
  clan_id UUID NOT NULL REFERENCES public.tank_clans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clan_id, user_id)
);

ALTER TABLE public.tank_clan_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read clan membership"
  ON public.tank_clan_members FOR SELECT
  USING (true);

CREATE POLICY "Members can join a clan for themselves"
  ON public.tank_clan_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members can leave their own clan"
  ON public.tank_clan_members FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins and service role manage clan membership"
  ON public.tank_clan_members FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Seasons
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS tank_seasons_single_active_idx
  ON public.tank_seasons ((true)) WHERE is_active;

ALTER TABLE public.tank_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read seasons"
  ON public.tank_seasons FOR SELECT
  USING (true);

CREATE POLICY "Admins and service role manage seasons"
  ON public.tank_seasons FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

INSERT INTO public.tank_seasons (number, name, is_active)
VALUES (1, 'Season 1', true)
ON CONFLICT (number) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tank_season_progress (
  season_id UUID NOT NULL REFERENCES public.tank_seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0,
  tier INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (season_id, user_id)
);

ALTER TABLE public.tank_season_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read season progress"
  ON public.tank_season_progress FOR SELECT
  USING (true);

CREATE POLICY "Admins and service role manage season progress"
  ON public.tank_season_progress FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Missions
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID REFERENCES public.tank_seasons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  reward_tokens INTEGER NOT NULL DEFAULT 0,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  target_count INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tank_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active missions"
  ON public.tank_missions FOR SELECT
  USING (is_active);

CREATE POLICY "Admins and service role manage missions"
  ON public.tank_missions FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

INSERT INTO public.tank_missions (season_id, title, description, reward_tokens, reward_xp, target_count, sort_order)
SELECT s.id, m.title, m.description, m.reward_tokens, m.reward_xp, m.target_count, m.sort_order
FROM public.tank_seasons s
CROSS JOIN (VALUES
  ('Sign in for the first time', 'Create your Tank account and sign in.', 10, 25, 1, 1),
  ('Watch a live camera', 'Open any room and watch a live feed.', 10, 25, 1, 2),
  ('Post your first chat message', 'Say hello in global chat.', 15, 50, 1, 3)
) AS m(title, description, reward_tokens, reward_xp, target_count, sort_order)
WHERE s.number = 1
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tank_mission_progress (
  mission_id UUID NOT NULL REFERENCES public.tank_missions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (mission_id, user_id)
);

ALTER TABLE public.tank_mission_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own mission progress"
  ON public.tank_mission_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins and service role manage mission progress"
  ON public.tank_mission_progress FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Inventory
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  rarity TEXT NOT NULL DEFAULT 'common',
  icon_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tank_inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active inventory items"
  ON public.tank_inventory_items FOR SELECT
  USING (is_active);

CREATE POLICY "Admins and service role manage inventory items"
  ON public.tank_inventory_items FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

INSERT INTO public.tank_inventory_items (slug, name, description, rarity)
VALUES ('starter-fishtoy', 'Starter Fishtoy', 'A basic fishtoy every viewer starts with once claimed.', 'common')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tank_player_inventory (
  item_id UUID NOT NULL REFERENCES public.tank_inventory_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, user_id)
);

ALTER TABLE public.tank_player_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own inventory"
  ON public.tank_player_inventory FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins and service role manage player inventory"
  ON public.tank_player_inventory FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Archives (past episodes) — intentionally seeded empty, no fake episodes.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_slug TEXT,
  title TEXT NOT NULL,
  episode_number INTEGER,
  aired_at TIMESTAMPTZ,
  thumbnail_url TEXT,
  video_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tank_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read archives"
  ON public.tank_archives FOR SELECT
  USING (true);

CREATE POLICY "Admins and service role manage archives"
  ON public.tank_archives FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Leaderboard — a live view over tank_profiles, not a fabricated table.
-- security_invoker so it respects the querying user's own RLS grants.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.tank_leaderboard
WITH (security_invoker = true) AS
SELECT
  p.user_id,
  COALESCE(p.display_name, pr.display_name, 'Fish #' || substr(p.user_id::text, 1, 6)) AS display_name,
  p.xp,
  p.level,
  p.tokens,
  cm.clan_id,
  c.tag AS clan_tag,
  ROW_NUMBER() OVER (ORDER BY p.xp DESC, p.tokens DESC) AS rank
FROM public.tank_profiles p
LEFT JOIN public.profiles pr ON pr.auth_user_id = p.user_id
LEFT JOIN public.tank_clan_members cm ON cm.user_id = p.user_id
LEFT JOIN public.tank_clans c ON c.id = cm.clan_id
ORDER BY p.xp DESC, p.tokens DESC;

GRANT SELECT ON public.tank_leaderboard TO anon, authenticated;
