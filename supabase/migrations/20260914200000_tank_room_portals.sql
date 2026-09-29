-- Migration: Tank Spatial Room Portals (Doorways)
-- Maps physical doorways/entryways across camera viewpoints for in-feed navigation.

create table if not exists public.tank_room_portals (
  id text primary key default ('portal-' || gen_random_uuid()::text),
  source_room_slug text not null,
  source_camera_id text,
  target_room_slug text not null,
  title text not null,
  description text,
  polygon jsonb not null,
  direction text not null default 'forward',
  display_mode text not null default 'ambient',
  icon text not null default 'door',
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for instant lookup on active room feed
create index if not exists idx_tank_room_portals_source on public.tank_room_portals (source_room_slug, enabled);

-- Enable RLS
alter table public.tank_room_portals enable row level security;

-- Public can view enabled portals
create policy "Allow public read access to enabled room portals"
  on public.tank_room_portals
  for select
  using (enabled = true);

-- Service role and staff have full access
create policy "Allow staff full access to room portals"
  on public.tank_room_portals
  for all
  using (auth.role() = 'service_role' or auth.role() = 'authenticated')
  with check (auth.role() = 'service_role' or auth.role() = 'authenticated');
