alter table public.zones
  add column if not exists og_image_width integer,
  add column if not exists og_image_height integer,
  add column if not exists og_image_bytes bigint,
  add column if not exists og_image_mime_type text,
  add column if not exists og_image_original_name text,
  add column if not exists og_image_source_width integer,
  add column if not exists og_image_source_height integer;

comment on column public.zones.og_image_width is
  'Rendered OpenGraph image width in pixels.';
comment on column public.zones.og_image_height is
  'Rendered OpenGraph image height in pixels.';
comment on column public.zones.og_image_bytes is
  'Rendered OpenGraph object size in bytes.';
comment on column public.zones.og_image_mime_type is
  'Rendered OpenGraph object MIME type.';
comment on column public.zones.og_image_original_name is
  'Original uploaded filename retained for dashboard display.';
comment on column public.zones.og_image_source_width is
  'Source upload width before OpenGraph rendering.';
comment on column public.zones.og_image_source_height is
  'Source upload height before OpenGraph rendering.';

update public.zones as z
set
  og_image_width = 1200,
  og_image_height = 630,
  og_image_bytes = nullif(o.metadata ->> 'size', '')::bigint,
  og_image_mime_type = coalesce(o.metadata ->> 'mimetype', 'image/jpeg')
from storage.objects as o
where o.bucket_id = z.og_image_bucket
  and o.name = z.og_image_path
  and z.og_image_path is not null;
