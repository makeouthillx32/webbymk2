alter table public.zones
  add column if not exists site_icon_bucket text,
  add column if not exists site_icon_path text,
  add column if not exists site_icon_updated_at timestamptz,
  add column if not exists site_icon_original_name text,
  add column if not exists site_icon_source_width integer,
  add column if not exists site_icon_source_height integer,
  add column if not exists site_icon_bytes bigint;

comment on column public.zones.site_icon_bucket is
  'Dashboard-owned Supabase Storage bucket containing this site icon set.';
comment on column public.zones.site_icon_path is
  'Versioned Storage path prefix containing the rendered site icon variants.';
comment on column public.zones.site_icon_updated_at is
  'Cache-busting timestamp for this site icon set.';
comment on column public.zones.site_icon_original_name is
  'Original uploaded icon filename retained for dashboard display.';
comment on column public.zones.site_icon_source_width is
  'Source upload width before square site icon rendering.';
comment on column public.zones.site_icon_source_height is
  'Source upload height before square site icon rendering.';
comment on column public.zones.site_icon_bytes is
  'Combined byte size of all rendered PNG icon variants.';
