-- Local source-of-truth copy of the migration already applied through the
-- Supabase MCP on 2026-09-13. Existing rooms remain open unless staff opt a
-- room into a base or XL gate.
alter table public.tank_rooms
  add column if not exists required_pass_tier text;

alter table public.tank_rooms
  drop constraint if exists tank_rooms_required_pass_tier_check;
alter table public.tank_rooms
  add constraint tank_rooms_required_pass_tier_check
  check (required_pass_tier is null or required_pass_tier in ('base', 'xl'));

alter table public.tank_profiles
  add column if not exists season_pass_tier text,
  add column if not exists season_pass_expires_at timestamptz,
  add column if not exists season_pass_tokens_granted_at timestamptz;

alter table public.tank_profiles
  drop constraint if exists tank_profiles_season_pass_tier_check;
alter table public.tank_profiles
  add constraint tank_profiles_season_pass_tier_check
  check (season_pass_tier is null or season_pass_tier in ('base', 'xl'));

update public.tank_profiles
set season_pass_tier = 'base'
where season_pass_active is true and season_pass_tier is null;

create index if not exists tank_rooms_required_pass_tier_idx
  on public.tank_rooms (required_pass_tier)
  where required_pass_tier is not null;
