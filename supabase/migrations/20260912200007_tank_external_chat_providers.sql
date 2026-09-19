begin;

-- External livestream chat is projected into Tank Global as real viewer
-- speech, not as a Tank account and never as a SYSTEM/CONSOLE identity.
-- Provider credentials are kept on a service-role-only table and are always
-- application-encrypted before they reach Postgres.

alter table public.tank_chat_messages
  add column if not exists source_provider text not null default 'tank',
  add column if not exists source_message_id text,
  add column if not exists source_channel_id text,
  add column if not exists source_user_id text,
  add column if not exists source_avatar_url text,
  add column if not exists source_name_color text,
  add column if not exists source_badges jsonb not null default '[]'::jsonb;

alter table public.tank_chat_messages
  drop constraint if exists tank_chat_messages_source_provider_check;
alter table public.tank_chat_messages
  add constraint tank_chat_messages_source_provider_check
  check (source_provider in ('tank', 'twitch', 'kick', 'youtube', 'trovo'));

alter table public.tank_chat_messages
  drop constraint if exists tank_chat_messages_source_badges_array_check;
alter table public.tank_chat_messages
  add constraint tank_chat_messages_source_badges_array_check
  check (jsonb_typeof(source_badges) = 'array');

alter table public.tank_chat_messages
  drop constraint if exists tank_chat_messages_external_global_only_check;
alter table public.tank_chat_messages
  add constraint tank_chat_messages_external_global_only_check
  check (
    source_provider = 'tank'
    or (
      room_id = 'global'
      and user_id is null
      and click_id is null
      and dm_id is null
      and nullif(btrim(source_message_id), '') is not null
      and nullif(btrim(source_user_id), '') is not null
    )
  );

-- Provider delivery is at-least-once. This is the durable idempotency gate;
-- NULL native message ids remain unrestricted by PostgreSQL UNIQUE semantics.
create unique index if not exists tank_chat_messages_provider_message_uidx
  on public.tank_chat_messages (source_provider, source_message_id)
  where source_message_id is not null;

create index if not exists tank_chat_messages_global_provider_recent_idx
  on public.tank_chat_messages (source_provider, created_at desc)
  where room_id = 'global' and deleted_at is null and source_provider <> 'tank';

create table if not exists public.tank_chat_provider_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  provider_account_id text,
  provider_account_name text,
  provider_channel_id text,
  provider_channel_name text,
  status text not null default 'disconnected',
  enabled boolean not null default false,
  scopes text[] not null default '{}',
  credential_ciphertext text,
  credential_iv text,
  credential_tag text,
  token_expires_at timestamptz,
  provider_cursor jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tank_chat_provider_connections_provider_check
    check (provider in ('twitch', 'kick', 'youtube', 'trovo')),
  constraint tank_chat_provider_connections_status_check
    check (status in ('disconnected', 'connecting', 'connected', 'error', 'retired')),
  constraint tank_chat_provider_connections_credentials_complete_check
    check (
      (credential_ciphertext is null and credential_iv is null and credential_tag is null)
      or (credential_ciphertext is not null and credential_iv is not null and credential_tag is not null)
    )
);

alter table public.tank_chat_provider_connections enable row level security;

-- No browser role can inspect provider accounts, errors, cursors, or encrypted
-- OAuth material. Staff reads and all mutations go through authenticated Tank
-- server routes, which use the service role and return a redacted projection.
revoke all on public.tank_chat_provider_connections from public, anon, authenticated;
grant all on public.tank_chat_provider_connections to service_role;

drop trigger if exists tank_chat_provider_connections_touch_updated_at
  on public.tank_chat_provider_connections;
create trigger tank_chat_provider_connections_touch_updated_at
  before update on public.tank_chat_provider_connections
  for each row execute function public.tank_touch_updated_at();

-- Seed metadata only. No account ids, tokens, or fabricated connection state.
insert into public.tank_chat_provider_connections (provider, status, enabled, last_error)
values
  ('twitch', 'disconnected', false, null),
  ('kick', 'disconnected', false, null),
  ('youtube', 'disconnected', false, null),
  ('trovo', 'retired', false, 'Trovo live streaming ended on 2026-06-30.')
on conflict (provider) do nothing;

commit;
