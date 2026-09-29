-- Tank Drops: watch-to-earn campaigns.
--
-- Scoped down from the full Kick-style vision to the self-contained loop:
-- a producer defines a campaign (optionally room-targeted, optionally
-- time-windowed), viewers accrue watch-seconds toward it via the existing
-- /api/tank/watch/heartbeat pipeline, and claim tiered rewards once eligible.
-- Cross-zone rewards (shop vouchers, blog unlocks) and the external
-- partner/webhook portal are explicitly out of scope for this pass.

create table if not exists public.tank_drop_campaigns (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  title text not null,
  description text,
  -- null = applies to every room / the Director feed. Set to a specific
  -- room slug to target one camera (e.g. "kitchen") the way the vision doc's
  -- "Kitchen Chaos Drop" example does.
  room_key text,
  -- [{ "minutes": 15, "rewardType": "tokens"|"xp"|"item", "rewardValue": 15,
  --    "itemSlug": "pumpkin", "label": "Night Owl Tier 1" }, ...]
  -- rewardValue is the token/xp amount for those types; itemSlug is used
  -- (and rewardValue ignored) when rewardType = "item".
  tiers jsonb not null default '[]'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tank_drop_progress (
  campaign_id uuid not null references public.tank_drop_campaigns(id) on delete cascade,
  user_id uuid not null,
  seconds_watched integer not null default 0,
  -- Array of claimed tier indices, e.g. [0, 1]. Indices into the parent
  -- campaign's tiers array — simplest way to prevent double-claiming a tier
  -- without a second join table.
  claimed_tiers jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create index if not exists tank_drop_progress_user_idx on public.tank_drop_progress (user_id);

alter table public.tank_drop_campaigns enable row level security;
alter table public.tank_drop_progress enable row level security;

-- Same shape as tank_missions' policies: public reads what's live, writes
-- are service-role (every actual write in the app goes through
-- createAdminClient()) or an admin JWT for direct/manual use.
create policy "Public can read active drop campaigns"
  on public.tank_drop_campaigns
  for select
  using (is_active);

create policy "Admins and service role manage drop campaigns"
  on public.tank_drop_campaigns
  for all
  using (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'
    or auth.role() = 'service_role'
  )
  with check (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'
    or auth.role() = 'service_role'
  );

create policy "Users can read their own drop progress"
  on public.tank_drop_progress
  for select
  using (auth.uid() = user_id);

create policy "Admins and service role manage drop progress"
  on public.tank_drop_progress
  for all
  using (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'
    or auth.role() = 'service_role'
  )
  with check (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'
    or auth.role() = 'service_role'
  );
