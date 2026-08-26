-- Migration: 20260815211500_tank_admin_buckets.sql
-- Description: Storage buckets for the Tank admin dashboard section — art
-- (UI decoration assets), emoji (chat emotes), and soundboard (audio clips).
-- All three are folder/filename-convention only; no database table backs
-- any of them (see src/lib/storage/upload.ts's listFolder/uploadToFolder).

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'tank-art',
    'tank-art',
    true,
    4194304,
    array['image/png', 'image/webp']::text[]
  ),
  (
    'tank-emoji',
    'tank-emoji',
    true,
    524288,
    array['image/png', 'image/gif', 'image/webp']::text[]
  ),
  (
    'tank-soundboard',
    'tank-soundboard',
    true,
    5242880,
    array['audio/mpeg', 'audio/wav', 'audio/ogg']::text[]
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
