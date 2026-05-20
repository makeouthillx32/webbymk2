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

  -- ── Connection coordinates (non-sensitive) ──────────────────────────────
  npm_host       text                NOT NULL DEFAULT '',    -- e.g. '<NPM_HOST_IP>'
  npm_port       integer             NOT NULL DEFAULT 81,
  proxy_host     text                NOT NULL DEFAULT '',    -- e.g. '<PROXY_HOST_IP>'
  proxy_port     integer             NOT NULL DEFAULT 3080,
  domain         text                NOT NULL DEFAULT '',    -- e.g. 'unenter.live'
  ddns_hostname  text                NOT NULL DEFAULT '',    -- e.g. 'unenter.asuscomm.com'
  public_url     text                NOT NULL DEFAULT '',    -- e.g. 'https://unenter.live'

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
-- Insert your environment(s) here with your actual infrastructure coordinates.
-- DO NOT commit real IPs or hostnames — use the UNAXIS env panel or run
-- setup.ps1 to populate your local config, then insert via the Supabase UI
-- or a separate private migration.
--
-- Example (replace ALL <placeholders> before running):
--
-- INSERT INTO public.environments (
--   name, type, status, active,
--   npm_host,              npm_port,
--   proxy_host,            proxy_port,
--   domain,                ddns_hostname,               public_url,
--   sort_order
-- ) VALUES (
--   'my-env',
--   'local-docker',
--   'unknown',
--   true,
--   '<NPM_HOST_IP>',       81,
--   '<PROXY_HOST_IP>',     3080,
--   '<YOUR_DOMAIN>',       '<YOUR_DDNS_HOSTNAME>',      'https://<YOUR_DOMAIN>',
--   0
-- );
