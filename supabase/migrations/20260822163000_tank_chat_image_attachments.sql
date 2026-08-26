-- 20260822163000_tank_chat_image_attachments.sql
-- Ephemeral Chat Image Attachments with 3-Hour Expiration & Collision-Free ID Sequence

CREATE SEQUENCE IF NOT EXISTS public.tank_chat_image_seq START WITH 734893600 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.tank_chat_attachments (
  id BIGINT PRIMARY KEY DEFAULT nextval('public.tank_chat_image_seq'),
  uploader_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT 'image/webp',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'purged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 hours'),
  purged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tank_chat_attachments_expires
ON public.tank_chat_attachments(expires_at)
WHERE status = 'active';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tank-chat-attachments', 'tank-chat-attachments', true, 5242880, ARRAY['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true;
