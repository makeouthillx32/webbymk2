-- Tank Tavern Phase 1: schema (config, shifts, queue, chit templates, chits,
-- mutinies, mutiny votes) + seeds. No behavior yet (that's Phase 1's second
-- migration, 20260828020000) and no UI. tank_tavern_enabled stays false.

-- ── tank_tavern_config (single row) ─────────────────────────────────────────
create table if not exists public.tank_tavern_config (
  id                       uuid primary key default gen_random_uuid(),
  shift_minutes            integer not null default 25,
  chit_interval_min_sec    integer not null default 60,
  chit_interval_max_sec    integer not null default 90,
  max_pending_chits        integer not null default 3,
  chit_expiry_sec          integer not null default 60,
  mutiny_threshold_pct     integer not null default 75,
  mutiny_vote_sec          integer not null default 30,
  click_bonus_pct          integer not null default 20,
  sfx_allowance_per_shift  integer not null default 5,
  sfx_cooldown_sec         integer not null default 20,
  takeover_shield_sec      integer not null default 60,
  updated_at               timestamptz not null default now()
);

alter table public.tank_tavern_config enable row level security;
create policy "Public reads Tavern config" on public.tank_tavern_config for select using (true);
create policy "Staff manage Tavern config" on public.tank_tavern_config for all
  using (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin' or auth.role() = 'service_role')
  with check (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin' or auth.role() = 'service_role');

insert into public.tank_tavern_config (id) values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- ── tank_tavern_shifts ───────────────────────────────────────────────────────
create table if not exists public.tank_tavern_shifts (
  id                        uuid primary key default gen_random_uuid(),
  bartender_id              uuid not null references auth.users(id),
  bartender_click_id        uuid null references public.tank_clicks(id),
  bartender_click_joined_at timestamptz null,
  -- Computed at creation: click_id not null and joined_at < started_at.
  -- Snapshotted rather than recomputed live so a mid-shift Click change
  -- can't retroactively grant/revoke the bonus.
  click_bonus_applies       boolean not null default false,
  started_at                timestamptz not null default now(),
  deadline_at               timestamptz not null,
  last_active_at            timestamptz not null default now(),
  chaos                     integer not null default 0 check (chaos between 0 and 100),
  sfx_allowance_remaining   integer not null default 5,
  sfx_last_used_at          timestamptz null,
  tips_tokens               integer not null default 0,
  status                    text not null default 'active'
    check (status in ('active','completed','rotated_out','stolen')),
  end_reason                text null,
  takeover_thief_id         uuid null references auth.users(id),
  takeover_item_id          uuid null references public.tank_inventory_items(id),
  takeover_shielded_until   timestamptz null,
  predecessor_shift_id      uuid null references public.tank_tavern_shifts(id),
  created_at                timestamptz not null default now()
);

-- Exactly one active shift, enforced at the DB level (not just app logic).
create unique index if not exists tank_tavern_shifts_one_active_uidx
  on public.tank_tavern_shifts (status) where status = 'active';

create index if not exists tank_tavern_shifts_bartender_idx on public.tank_tavern_shifts (bartender_id);

alter table public.tank_tavern_shifts enable row level security;
create policy "Public reads the active shift" on public.tank_tavern_shifts
  for select using (status = 'active');
create policy "Staff read full shift history" on public.tank_tavern_shifts
  for select using (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) in ('admin','moderator'));
create policy "Service role manages shifts" on public.tank_tavern_shifts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── tank_tavern_queue: free FIFO, one waiting entry per user ───────────────
create table if not exists public.tank_tavern_queue (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id),
  position   bigint not null,
  joined_at  timestamptz not null default now()
);

create sequence if not exists public.tank_tavern_queue_position_seq;

alter table public.tank_tavern_queue enable row level security;
-- Private per spec ("Queue entries ... remain private"). A user may see and
-- leave their own row; nothing about the queue's contents is public.
create policy "Users manage their own queue entry" on public.tank_tavern_queue
  for select using (auth.uid() = user_id);
create policy "Users can leave the queue" on public.tank_tavern_queue
  for delete using (auth.uid() = user_id);
create policy "Service role manages the queue" on public.tank_tavern_queue for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── tank_tavern_chit_templates: staff-authored order/dialogue pool ────────
create table if not exists public.tank_tavern_chit_templates (
  id            uuid primary key default gen_random_uuid(),
  weight        integer not null default 1 check (weight > 0),
  dialogue      text not null,
  -- null = an ordinary order chit; otherwise identifies a "trouble" chit type.
  trouble_type  text null,
  payload       jsonb not null default '{}'::jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.tank_tavern_chit_templates enable row level security;
-- Templates aren't part of the public snapshot — only generated chits are.
create policy "Staff manage chit templates" on public.tank_tavern_chit_templates for all
  using (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) in ('admin','moderator') or auth.role() = 'service_role')
  with check (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) in ('admin','moderator') or auth.role() = 'service_role');

-- ── tank_tavern_chits: generated chits, immutable template snapshot ───────
create table if not exists public.tank_tavern_chits (
  id                 uuid primary key default gen_random_uuid(),
  shift_id           uuid not null references public.tank_tavern_shifts(id),
  template_id        uuid not null references public.tank_tavern_chit_templates(id),
  dialogue_snapshot  text not null,
  payload_snapshot   jsonb not null,
  created_at         timestamptz not null default now(),
  deadline_at        timestamptz not null,
  resolved_by        uuid null references auth.users(id),
  resolved_at        timestamptz null,
  outcome            text not null default 'pending'
    check (outcome in ('pending','served','expired','cancelled')),
  idempotency_key    text null,
  created_by_tick    boolean not null default true
);

create unique index if not exists tank_tavern_chits_idempotency_uidx
  on public.tank_tavern_chits (shift_id, idempotency_key) where idempotency_key is not null;
create index if not exists tank_tavern_chits_shift_idx on public.tank_tavern_chits (shift_id, outcome);

alter table public.tank_tavern_chits enable row level security;
create policy "Public reads active shift chits" on public.tank_tavern_chits
  for select using (
    exists (select 1 from public.tank_tavern_shifts s where s.id = shift_id and s.status = 'active')
  );
create policy "Staff read all chits" on public.tank_tavern_chits
  for select using (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) in ('admin','moderator'));
create policy "Service role manages chits" on public.tank_tavern_chits for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── tank_tavern_mutinies: one open mutiny per shift ────────────────────────
create table if not exists public.tank_tavern_mutinies (
  id                  uuid primary key default gen_random_uuid(),
  shift_id            uuid not null references public.tank_tavern_shifts(id),
  initiator_id        uuid not null references auth.users(id),
  initiator_click_id  uuid not null references public.tank_clicks(id),
  started_at          timestamptz not null default now(),
  vote_deadline_at    timestamptz not null,
  status              text not null default 'open' check (status in ('open','overturned','defended')),
  eligible_count      integer null,
  overturn_count      integer null,
  defend_count        integer null
);

create unique index if not exists tank_tavern_mutinies_one_open_uidx
  on public.tank_tavern_mutinies (shift_id) where status = 'open';

alter table public.tank_tavern_mutinies enable row level security;
-- Aggregate mutiny state is public per spec; there is no per-voter data on
-- this table (that lives in tank_tavern_mutiny_votes, which stays private),
-- so a plain public SELECT here is already the "aggregate only" boundary.
create policy "Public reads mutinies of the active shift" on public.tank_tavern_mutinies
  for select using (
    exists (select 1 from public.tank_tavern_shifts s where s.id = shift_id and s.status = 'active')
  );
create policy "Staff read all mutinies" on public.tank_tavern_mutinies
  for select using (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) in ('admin','moderator'));
create policy "Service role manages mutinies" on public.tank_tavern_mutinies for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── tank_tavern_mutiny_votes: one vote per eligible viewer ─────────────────
create table if not exists public.tank_tavern_mutiny_votes (
  mutiny_id  uuid not null references public.tank_tavern_mutinies(id),
  user_id    uuid not null references auth.users(id),
  choice     text not null check (choice in ('overturn','defend')),
  voted_at   timestamptz not null default now(),
  primary key (mutiny_id, user_id)
);

alter table public.tank_tavern_mutiny_votes enable row level security;
-- Private per spec ("votes ... remain private"). A user may see/cast their
-- own vote; the tally is exposed only in aggregate via tank_tavern_mutinies.
create policy "Users manage their own vote" on public.tank_tavern_mutiny_votes
  for select using (auth.uid() = user_id);
create policy "Users can cast their own vote" on public.tank_tavern_mutiny_votes
  for insert with check (auth.uid() = user_id);
create policy "Service role manages votes" on public.tank_tavern_mutiny_votes for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── tank_sfx_library: Bartender-approved flag ──────────────────────────────
-- No existing "enabled for purpose X" precedent — only a blanket is_active.
alter table public.tank_sfx_library add column if not exists tavern_enabled boolean not null default false;

-- ── apron-snatcher: the Mythic takeover item ────────────────────────────────
-- Staff-grant-only distribution initially; drop/crafting odds unset until
-- the economy is balanced (per spec).
insert into public.tank_inventory_items
  (slug, name, description, rarity, icon_url, is_active, effect_type, effect_payload, is_consumable, max_stack)
values
  ('apron-snatcher', 'Apron Snatcher',
   'Steal the Apron. Ends the current Bartender''s shift on the spot and starts a fresh one for you.',
   'mythic', null, true, 'tavern_apron_takeover', '{}'::jsonb, true, 5)
on conflict (slug) do update set
  effect_type = excluded.effect_type,
  is_consumable = excluded.is_consumable,
  max_stack = excluded.max_stack;

-- ── Feature flag ─────────────────────────────────────────────────────────────
insert into public.tank_platform_settings (key, value)
values ('tank_tavern_enabled', jsonb_build_object('enabled', false))
on conflict (key) do nothing;
