-- ============================================================
-- Migration: unaxis_environments
-- Stores UNAXIS environment records — inspired by the Portainer
-- Endpoint model (src/legacy/portainer/api/portainer.ts).
--
-- Sensitive credentials (passwords, Azure keys, TLS certs) are
-- stored in vault.secrets and referenced here by UUID only.
-- The actual values never appear in this table.
--
-- Environment types map to Portainer EndpointType:
--   local-docker  → DockerEnvironment (1)            — current P0W3R stack
--   remote-docker → AgentOnDockerEnvironment (2)     — remote VPS / cloud VM
--   azure         → AzureEnvironment (3)             — Azure Container Instances
--   edge          → EdgeAgentOnDockerEnvironment (4) — future edge nodes
--
-- After applying this migration, run once to store credentials in Vault:
--
--   UPDATE public.environments
--   SET npm_secret_id = vault.create_secret(
--     '<your-npm-password>',
--     'npm-prod-password',
--     'NPM admin password — prod environment'
--   )
--   WHERE name = 'prod';
--
-- For Azure environments add secrets similarly:
--   vault.create_secret('<value>', 'azure-prod-app-id', '...')
-- ============================================================

-- ── 1. Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE environment_type AS ENUM (
  'local-docker',
  'remote-docker',
  'azure',
  'edge'
);

CREATE TYPE environment_status AS ENUM (
  'up',
  'down',
  'unknown'
);

-- ── 2. Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.environments (
  id             uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text                UNIQUE NOT NULL,       -- 'prod', 'staging', 'azure-test'
  type           environment_type    NOT NULL DEFAULT 'local-docker',
  status         environment_status  NOT NULL DEFAULT 'unknown',
  active         boolean             NOT NULL DEFAULT false, -- only one true at a time
  is_default_target boolean          NOT NULL DEFAULT false, -- pre-selected wizard target

  -- ── Connection coordinates (non-sensitive) ──────────────────────────────
  npm_host       text                NOT NULL DEFAULT '',    -- e.g. '<NPM_HOST_IP>'
  npm_port       integer             NOT NULL DEFAULT 81,
  proxy_host     text                NOT NULL DEFAULT '',    -- e.g. '<PROXY_HOST_IP>'
  proxy_port     integer             NOT NULL DEFAULT 3080,
  domain         text                NOT NULL DEFAULT '',    -- e.g. 'unenter.live'
  ddns_hostname  text                NOT NULL DEFAULT '',    -- e.g. 'unenter.asuscomm.com'
  public_url     text                NOT NULL DEFAULT '',    -- e.g. 'https://unenter.live'

  -- ── Docker & Agent coordinates ──────────────────────────────────────────
  docker_url     text                NOT NULL DEFAULT '',    -- e.g. 'unix:///var/run/docker.sock'
  machine_role   text                NOT NULL DEFAULT '',    -- e.g. 'App · DB · Proxy · Zones'
  agent_url      text                NOT NULL DEFAULT '',    -- e.g. 'http://127.0.0.1:8888'
  agent_port     integer             NOT NULL DEFAULT 8888,
  agent_status   text                NOT NULL DEFAULT 'unknown',
  agent_last_seen_at timestamptz,
  agent_version  text                NOT NULL DEFAULT '',
  agent_token_secret_id uuid,                                -- vault secret ref for bearer token

  -- ── TLS config (paths only — cert contents go in Vault) ─────────────────
  tls_config     jsonb               NOT NULL DEFAULT '{
    "tls": false,
    "skipVerify": false,
    "skipClientVerify": false,
    "caCertPath": "",
    "certPath": "",
    "keyPath": ""
  }',

  -- ── Vault secret references (uuid → vault.secrets.id) ───────────────────
  -- Looked up at runtime to decrypt the actual credential.
  -- NULL = credential not configured for this environment.
  npm_secret_id             uuid,   -- NPM admin password
  azure_app_id_secret_id    uuid,   -- Azure ApplicationID
  azure_tenant_id_secret_id uuid,   -- Azure TenantID
  azure_auth_key_secret_id  uuid,   -- Azure AuthenticationKey

  -- ── Metadata ─────────────────────────────────────────────────────────────
  tags           text[]              NOT NULL DEFAULT '{}',
  sort_order     integer             NOT NULL DEFAULT 0,
  created_at     timestamptz         NOT NULL DEFAULT now(),
  updated_at     timestamptz         NOT NULL DEFAULT now()
);

-- ── 3. Constraints ────────────────────────────────────────────────────────────

-- Enforce exactly one active environment at a time via partial unique index.
-- INSERT/UPDATE with active=true while another row is already true → unique violation.
CREATE UNIQUE INDEX environments_one_active
  ON public.environments (active)
  WHERE active = true;

-- ── 4. updated_at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER environments_updated_at
  BEFORE UPDATE ON public.environments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.environments ENABLE ROW LEVEL SECURITY;

-- The TUI connects as service_role — full access.
-- No anon/authenticated policies: environments are internal infra, not user data.
CREATE POLICY "service role full access"
  ON public.environments
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 6. Seed ───────────────────────────────────────────────────────────────────
-- Inserts a baseline 'POWER' environment record automatically.
-- This ensures the environments tab is pre-seeded with the local developer node
-- coordinates upon first boot, preventing a blank TUI view.

INSERT INTO public.environments (
  id,
  name,
  type,
  status,
  active,
  is_default_target,
  docker_url,
  machine_role,
  agent_url,
  agent_port,
  agent_status,
  npm_host,
  npm_port,
  proxy_host,
  proxy_port,
  domain,
  public_url
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'POWER',
  'local-docker',
  'unknown',
  true,
  true,
  'unix:///var/run/docker.sock',
  'App · DB · Proxy · Zones',
  'http://127.0.0.1:8888',
  8888,
  'unknown',
  '127.0.0.1',
  81,
  '127.0.0.1',
  3080,
  'unenter.live',
  'https://unenter.live'
) ON CONFLICT (name) DO NOTHING;
