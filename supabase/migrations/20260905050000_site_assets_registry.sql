-- 20260905050000_site_assets_registry.sql
-- ---------------------------------------------------------------------------
-- Hot-swappable landing assets.
--
-- Today every heavy landing asset is baked into the repo and therefore into
-- EVERY zone image:
--
--   public/video/hero-video.mp4            3.6 MB
--   public/video/hero-video.webm           2.1 MB
--   public/images/starry-background4K_1.webm  2.4 MB
--   public/models/unenter.glb              4.8 MB
--                                        ---------
--                                         12.9 MB  × every public zone image
--
-- Changing any of them means a rebuild + redeploy of every zone. This registry
-- moves them behind a stable KEY so the file can be replaced from the dashboard
-- (or a single UPDATE) with no rebuild.
--
-- ── Design notes ───────────────────────────────────────────────────────────
--
-- * Mirrors the existing `tank_theme_assets` shape on purpose (asset_key /
--   storage_bucket / storage_path / public_url / format) so there is one asset
--   registry idiom in this codebase, not two.
-- * `scope` replaces tank's `theme_id` — 'core-landing', 'labs-landing', …
-- * NOTHING IS SEEDED. The resolver (src/lib/siteAssets.ts) falls back to the
--   existing /public path whenever a row is absent or inactive, so applying
--   this migration is a visual no-op. An asset only goes live once a row is
--   inserted, which makes rollback a DELETE.
-- * Idempotent throughout — safe to re-run.
-- ---------------------------------------------------------------------------

-- ── Bucket ─────────────────────────────────────────────────────────────────
-- `site-assets` already exists but is capped at 8 MB and images-only
-- (jpeg/png/webp), so it can take neither the videos nor the .glb. New bucket
-- rather than widening that one: keeps the existing image contract intact.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'landing-assets',
  'landing-assets',
  true,
  33554432, -- 32 MB — largest current asset is 4.8 MB, leaves headroom for 4K loops
  array[
    'video/mp4',
    'video/webm',
    'image/webp',
    'image/png',
    'image/jpeg',
    'image/avif',
    'model/gltf-binary',
    'model/gltf+json',
    'application/octet-stream' -- .glb often uploads as octet-stream
  ]
)
on conflict (id) do nothing;

-- ── Registry table ─────────────────────────────────────────────────────────
create table if not exists public.site_assets (
  id             uuid primary key default gen_random_uuid(),
  scope          text not null,                    -- 'core-landing', 'labs-landing', …
  asset_key      text not null,                    -- 'hero.video.webm', 'banner.model'
  kind           text not null,                    -- 'video' | 'image' | 'model'
  storage_bucket text not null default 'landing-assets',
  storage_path   text not null,
  public_url     text not null,
  format         text,                             -- 'webm', 'mp4', 'glb'
  is_active      boolean not null default true,
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- One active row per (scope, key). Swapping = UPDATE this row's public_url.
create unique index if not exists site_assets_scope_key_uniq
  on public.site_assets (scope, asset_key);

create index if not exists site_assets_scope_active_idx
  on public.site_assets (scope) where is_active;

comment on table public.site_assets is
  'Hot-swappable site asset registry. Resolver falls back to the bundled /public path when a key is absent or inactive, so a missing row is never a broken page.';

-- ── RLS: world-readable, admin-writable ────────────────────────────────────
alter table public.site_assets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='site_assets'
      and policyname='site_assets_public_read'
  ) then
    -- Landing pages render for signed-out visitors, so read must be anonymous.
    create policy site_assets_public_read on public.site_assets
      for select using (is_active);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='site_assets'
      and policyname='site_assets_admin_write'
  ) then
    -- Deliberately WITH CHECK as well as USING: without it a writer could move
    -- a row out from under the predicate. (Same footgun as the profiles
    -- policies, which have USING only — see vault/Core/labs-research-account-area.)
    create policy site_assets_admin_write on public.site_assets
      for all
      using (
        exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'admin')
      )
      with check (
        exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'admin')
      );
  end if;
end $$;

-- ── updated_at maintenance ─────────────────────────────────────────────────
create or replace function public.touch_site_assets_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists site_assets_touch_updated_at on public.site_assets;
create trigger site_assets_touch_updated_at
  before update on public.site_assets
  for each row execute function public.touch_site_assets_updated_at();

-- ── Storage policies for the new bucket ────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='landing_assets_public_read'
  ) then
    create policy landing_assets_public_read on storage.objects
      for select using (bucket_id = 'landing-assets');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='landing_assets_admin_write'
  ) then
    create policy landing_assets_admin_write on storage.objects
      for all
      using (
        bucket_id = 'landing-assets'
        and exists (select 1 from public.profiles p
                     where p.id = auth.uid() and p.role = 'admin')
      )
      with check (
        bucket_id = 'landing-assets'
        and exists (select 1 from public.profiles p
                     where p.id = auth.uid() and p.role = 'admin')
      );
  end if;
end $$;
