alter table public.zones
  add column if not exists og_image_bucket text,
  add column if not exists og_image_path text,
  add column if not exists og_image_alt text,
  add column if not exists og_image_updated_at timestamptz;

comment on column public.zones.og_image_bucket is
  'Dashboard-owned Supabase Storage bucket containing this site OpenGraph image.';
comment on column public.zones.og_image_path is
  'Dashboard-owned object path for this site OpenGraph image.';
comment on column public.zones.og_image_alt is
  'Accessible description used for OpenGraph and Twitter image metadata.';
comment on column public.zones.og_image_updated_at is
  'Cache-busting timestamp for this site OpenGraph image.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'site-assets',
  'site-assets',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
