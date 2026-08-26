-- 20260712_sites_apps_catalog.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Sites & Apps catalog — Phase 2 (additive).
-- Tethers UNAXIS control-plane zones to core Supabase WITHOUT letting infra
-- state own public visibility. FULLY ADDITIVE: no existing column is altered or
-- dropped; existing public behavior (footer via footer_pinned) is preserved by
-- backfill. control.db (UNAXIS SQLite) is not touched by this migration.
--
-- Authority (per-column map, audited 2026-07-12):
--   UNAXIS-owned : key, domain, service, container, image, dockerfile,
--                  upstream_env_key, enabled, environment_id
--   Insert-seed  : label, sort_order  (UNAXIS writes on INSERT only, never
--                  overwrites — so dashboard edits survive sync)
--   Dashboard    : footer_pinned + all new presentation/visibility columns below
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Enums ────────────────────────────────────────────────────────────────────
do $$ begin create type zone_visibility as enum ('private','unlisted','public');
exception when duplicate_object then null; end $$;

do $$ begin create type zone_lifecycle_state as enum ('active','missing','archived');
exception when duplicate_object then null; end $$;

do $$ begin create type zone_public_status as enum ('online','degraded','offline','unknown','stale');
exception when duplicate_object then null; end $$;

-- 2. public.zones — presentation + visibility (all additive) ──────────────────
alter table public.zones
  add column if not exists description        text,
  add column if not exists image_url          text,
  add column if not exists visibility          zone_visibility      not null default 'private',
  add column if not exists lifecycle_state     zone_lifecycle_state not null default 'active',
  add column if not exists show_in_footer      boolean not null default false,
  add column if not exists show_in_directory   boolean not null default false,
  add column if not exists include_in_sitemap  boolean not null default false,
  add column if not exists health_path         text    not null default '/',
  add column if not exists expected_status     integer not null default 200,
  add column if not exists source              text    not null default 'unaxis',
  add column if not exists last_synced_at      timestamptz,
  add column if not exists metadata            jsonb   not null default '{}'::jsonb;

-- 3. Backfill — preserve exactly what's public today (least exposure) ──────────
-- footer_pinned zones (blog, shop, docs) stay public + in footer. Everyone else
-- becomes private. Directory + sitemap stay OFF (new opt-in consumers, Phase 8).
update public.zones set
  show_in_footer  = coalesce(footer_pinned, false),
  visibility      = case when footer_pinned then 'public'::zone_visibility
                                             else 'private'::zone_visibility end,
  lifecycle_state = case when enabled then 'active'::zone_lifecycle_state
                                       else 'archived'::zone_lifecycle_state end;

-- 4. Supporting tables (empty until sync/probe phases; soft zone_key/env_id
--    joins — no hard FKs so sync ordering can't fail a migration) ─────────────
create table if not exists public.managed_environments (
  id                 uuid primary key default gen_random_uuid(),
  env_id             text unique not null,          -- UNAXIS permanent environment id
  name               text,
  role               text,                           -- primary | staging | standby
  agent_url          text,
  agent_status       text,
  agent_version      text,
  agent_last_seen_at timestamptz,
  last_synced_at     timestamptz,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.zone_deployments (
  id                      uuid primary key default gen_random_uuid(),
  zone_key                text not null,
  env_id                  text not null,
  role                    text not null default 'primary',
  container_state         text,
  deployed_revision       text,
  image_digest            text,
  last_deploy_at          timestamptz,
  last_proxy_verified_at  timestamptz,
  observed_at             timestamptz,
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (zone_key, env_id)
);
create index if not exists zone_deployments_zone_key_idx on public.zone_deployments (zone_key);

create table if not exists public.zone_endpoint_status (
  zone_key             text primary key,
  public_status        zone_public_status not null default 'unknown',
  http_status          integer,
  response_time_ms     integer,
  checked_at           timestamptz,
  consecutive_failures integer not null default 0,
  failure_reason       text
);

create table if not exists public.zone_endpoint_checks (
  id             bigint generated always as identity primary key,
  zone_key       text not null,
  http_status    integer,
  response_time_ms integer,
  ok             boolean,
  failure_reason text,
  checked_at     timestamptz not null default now()
);
create index if not exists zone_endpoint_checks_zone_key_idx on public.zone_endpoint_checks (zone_key, checked_at desc);

create table if not exists public.zone_sync_runs (
  id             uuid primary key default gen_random_uuid(),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  actor          text,
  source         text not null default 'unaxis',
  dry_run        boolean not null default false,
  created_count  integer not null default 0,
  updated_count  integer not null default 0,
  missing_count  integer not null default 0,
  conflict_count integer not null default 0,
  warnings       jsonb not null default '[]'::jsonb,
  result         text
);

create table if not exists public.zone_audit_events (
  id              bigint generated always as identity primary key,
  at              timestamptz not null default now(),
  actor           text,
  action          text not null,
  zone_key        text,
  before          jsonb,
  after           jsonb,
  payload_version text,
  source          text
);

-- 5. RLS — match existing public.zones policy: service_role only, no anon.
--    Public consumers stay server-mediated (Phase 8 adds a scoped public view).
alter table public.managed_environments enable row level security;
alter table public.zone_deployments      enable row level security;
alter table public.zone_endpoint_status  enable row level security;
alter table public.zone_endpoint_checks  enable row level security;
alter table public.zone_sync_runs        enable row level security;
alter table public.zone_audit_events     enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'managed_environments','zone_deployments','zone_endpoint_status',
    'zone_endpoint_checks','zone_sync_runs','zone_audit_events'
  ] loop
    execute format(
      'create policy service_key_full_access on public.%I for all
         using ((select auth.role()) = ''service_role'')
         with check ((select auth.role()) = ''service_role'')', t);
  end loop;
end $$;
