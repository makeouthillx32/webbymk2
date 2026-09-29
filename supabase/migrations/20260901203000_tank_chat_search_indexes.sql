-- Room-scoped chat discovery searches message bodies and sender names with
-- case-insensitive contains matching. Trigram indexes keep those searches
-- responsive as history grows; deleted rows are intentionally excluded to
-- match the public and private chat read paths.

create extension if not exists pg_trgm with schema extensions;

create index if not exists tank_chat_messages_active_body_trgm_idx
  on public.tank_chat_messages
  using gin (body extensions.gin_trgm_ops)
  where deleted_at is null;

create index if not exists tank_chat_messages_active_user_name_trgm_idx
  on public.tank_chat_messages
  using gin (user_name extensions.gin_trgm_ops)
  where deleted_at is null;
