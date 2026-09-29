-- Tank per-user settings get a table of their own.
--
-- They lived in auth.users.raw_user_meta_data.tank_settings. Supabase copies
-- user_metadata into the session TWICE (inside the access token and in the
-- stored user object), so 634 bytes of settings cost ~1.7 KB of the base64
-- session cookie -- enough to push the Cookie header past the 4 KB proxy limit
-- that already caused sign-in failures once. saveTankUserSettings also tried to
-- upsert tank_profiles.settings, a column that never existed, so the metadata
-- copy was the only one.
--
-- Not tank_profiles: that table is publicly readable (player profiles).
-- Settings are the owner's business only; the server writes them.

create table if not exists public.tank_user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tank_user_settings enable row level security;

drop policy if exists "Users read their own Tank settings" on public.tank_user_settings;
create policy "Users read their own Tank settings"
  on public.tank_user_settings for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Writes go through the Tank server with the service role (bypasses RLS).
revoke insert, update, delete on public.tank_user_settings from anon, authenticated;

-- Carry every existing copy across. The metadata copy is removed separately,
-- after the code that reads this table is live.
insert into public.tank_user_settings (user_id, settings, updated_at)
select id, raw_user_meta_data -> 'tank_settings', now()
from auth.users
where jsonb_typeof(raw_user_meta_data -> 'tank_settings') = 'object'
on conflict (user_id) do nothing;
