-- supabase/migrations/20260916000000_agent_identities.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- SPIFFE Agent Identity Registry
--
-- Introduces two tables:
--   agent_identities   — the registry of allowed agent SPIFFE IDs
--   agent_token_audit  — append-only log of all token issuances
--
-- Access model:
--   All reads and writes go through the token endpoint (service role only).
--   No end-user RLS policies are needed — these tables are never accessed
--   via the client-side Supabase JS client.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Agent registry ─────────────────────────────────────────────────────────

create table if not exists agent_identities (
  id           uuid        primary key default gen_random_uuid(),
  -- Full SPIFFE ID URI, e.g. spiffe://unenter.live/agents/claude
  spiffe_id    text        not null unique,
  display_name text        not null,
  description  text,
  public_key_jwk jsonb,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  -- Supabase user who registered this agent (admin; nullable for bootstrap)
  created_by   uuid        references auth.users(id) on delete set null
);

alter table agent_identities add column if not exists public_key_jwk jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_identities_active_key_check'
  ) then
    alter table agent_identities
      add constraint agent_identities_active_key_check
      check (not is_active or public_key_jwk is not null);
  end if;
end $$;

comment on table  agent_identities                is 'SPIFFE agent identity registry — one row per allowed agent workload.';
comment on column agent_identities.spiffe_id      is 'Full spiffe:// URI that uniquely identifies this agent workload.';
comment on column agent_identities.is_active      is 'False = revoked. Token endpoint rejects SVIDs for inactive agents.';
comment on column agent_identities.public_key_jwk is 'Agent-owned public JWK used to verify short-lived RFC 7523 client assertions.';
comment on column agent_identities.last_seen_at   is 'Updated on every successful token issuance (heartbeat).';

-- Index for the hot-path lookup by SPIFFE ID
create index if not exists agent_identities_spiffe_id_idx
  on agent_identities (spiffe_id)
  where is_active = true;

-- ── Token audit log ────────────────────────────────────────────────────────

create table if not exists agent_token_audit (
  id           bigint      primary key generated always as identity,
  agent_id     uuid        references agent_identities(id) on delete set null,
  spiffe_id    text        not null,
  -- 'self_auth' | 'delegation'
  action       text        not null check (action in ('self_auth', 'delegation')),
  -- Null for self_auth; Supabase user UUID for delegation
  subject_user uuid,
  audience     text        not null,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  -- Client IP (best-effort; may be null behind proxies without X-Forwarded-For)
  ip           text
);

comment on table agent_token_audit is 'Append-only audit log of every agent token issuance.';

create index if not exists agent_token_audit_spiffe_idx
  on agent_token_audit (spiffe_id, issued_at desc);

create index if not exists agent_token_audit_subject_idx
  on agent_token_audit (subject_user, issued_at desc)
  where subject_user is not null;

-- ── Row-Level Security ─────────────────────────────────────────────────────
-- Both tables are service-role only. The token endpoint runs with service_role
-- credentials and never exposes these tables to browser clients.

alter table agent_identities  enable row level security;
alter table agent_token_audit enable row level security;

revoke all on table agent_identities, agent_token_audit from anon, authenticated;
grant select, insert, update, delete on table agent_identities, agent_token_audit to service_role;
grant usage, select on sequence agent_token_audit_id_seq to service_role;

-- No permissive policies — only service_role (which bypasses RLS) can access.
-- Deny-by-default is the correct posture here.

-- ── Bootstrap: Claude agent identity ──────────────────────────────────────
-- Insert a placeholder row for Claude so the registry is non-empty on deploy.
-- The SPIFFE ID is canonical; the is_active=false until the operator configures
-- the key pair and flips it to true via the admin API.

insert into agent_identities (spiffe_id, display_name, description, is_active)
values (
  'spiffe://unenter.live/agents/claude',
  'Claude (Antigravity)',
  'Antigravity AI coding assistant — acts as infrastructure operator and Unenter product agent.',
  false   -- set to true after CLAUDE_AGENT_SPIFFE_PRIVATE_KEY_JWK is configured
)
on conflict (spiffe_id) do nothing;
