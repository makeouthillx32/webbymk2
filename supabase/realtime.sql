-- supabase/realtime.sql
-- Required by the realtime service to set up its internal schema.
-- Mounted into Postgres at: /docker-entrypoint-initdb.d/migrations/99-realtime.sql

CREATE SCHEMA IF NOT EXISTS _realtime;

CREATE TABLE IF NOT EXISTS _realtime.tenants (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  name                  text,
  external_id           text UNIQUE,
  jwt_secret            text,
  max_concurrent_users  integer NOT NULL DEFAULT 200,
  inserted_at           timestamp(0) without time zone NOT NULL,
  updated_at            timestamp(0) without time zone NOT NULL,
  max_events_per_second integer NOT NULL DEFAULT 100,
  postgres_cdc_default  text DEFAULT 'postgres_cdc_rls'::text,
  notify_private_alpha  boolean NOT NULL DEFAULT false,
  private_only          boolean NOT NULL DEFAULT false,
  CONSTRAINT tenants_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS _realtime.extensions (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  type            text,
  settings        jsonb,
  tenant_id       text,
  inserted_at     timestamp(0) without time zone NOT NULL,
  updated_at      timestamp(0) without time zone NOT NULL,
  CONSTRAINT extensions_pkey PRIMARY KEY (id),
  CONSTRAINT extensions_tenant_external_id_type_index UNIQUE (tenant_id, type)
);

-- Seed the default tenant so realtime connects on first boot
INSERT INTO _realtime.tenants (
  id, name, external_id, jwt_secret,
  max_concurrent_users, max_events_per_second,
  inserted_at, updated_at
)
VALUES (
  gen_random_uuid(),
  'realtime-dev',
  'realtime-dev',
  'your-super-secret-jwt-token-with-at-least-32-characters',
  200, 100,
  NOW(), NOW()
)
ON CONFLICT (external_id) DO NOTHING;