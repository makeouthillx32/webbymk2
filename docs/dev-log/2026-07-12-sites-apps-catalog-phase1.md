---
tags: [unaxis, supabase, sites-apps, catalog, dev-log]
date: 2026-07-12
---

# Sites & Apps catalog — first milestone (schema + toggle + read-only dashboard)

## Phase 1 audit findings
- `public.zones` ALREADY existed (15 rows, matches `unaxis zones`) and was a MIXED
  infra+presentation table: key,label,domain,service,container,image,dockerfile,
  upstream_env_key,sort_order,enabled,environment_id,footer_pinned.
- footer currently driven by `footer_pinned=true` → blog, shop, docs (the 3 public).
- environment_id set only for logs/logz/nick/nick2 = L0V3 (052a307d-…); null = POWER.
- RLS: ONE policy — service_role full access, NO anon. All public reads already
  server-mediated. Good; means dashboard (server) + toggle (server) fit existing model.

## Per-column authority map (the artifact Phase 1 had to produce)
- UNAXIS-owned: key, domain, service, container, image, dockerfile, upstream_env_key, enabled, environment_id
- Insert-seed only (never overwrite): label, sort_order  ← so dashboard edits survive sync
- Dashboard-owned: footer_pinned + all new presentation/visibility columns

## Migration applied (additive, reversible) — supabase/migrations/20260712_sites_apps_catalog.sql
- Enums: zone_visibility, zone_lifecycle_state, zone_public_status
- public.zones += description, image_url, visibility(default private), lifecycle_state,
  show_in_footer, show_in_directory, include_in_sitemap, health_path, expected_status,
  source, last_synced_at, metadata
- Backfill preserved current behavior: footer_pinned zones → visibility=public + show_in_footer;
  everyone else private; directory/sitemap OFF (opt-in later). blog/shop/docs verified public.
- New tables: managed_environments, zone_deployments, zone_endpoint_status,
  zone_endpoint_checks, zone_sync_runs, zone_audit_events — all RLS service_role-only, empty.

## TUI public toggle (writes visibility to Supabase)
- New shared module `src/ink/zone-visibility.ts` (fetch/set/toggle via kong REST + service key).
- IPC: `unaxis zone <key> public|private|unlisted|visibility`. Tested end-to-end:
  set apptest1 public → confirmed in DB → reverted. Deduped from useIpcBridge inline copy.
- Visual: `[P] Public toggle` action added to the zones ActionPanel + ZonesView executeAction
  (flips public↔private, notification). Same shared module as the IPC path.

## Read-only dashboard — /dashboard/[id]/settings/sites
- Server component, `requireAdmin()` gate (profiles.role==='admin', redirects) — auth server-side.
- Reads catalog via server-only `createAdminClient()` (service role; RLS-locked table).
- Compact table: Site | Domain | Environment | Public | Runtime | Agent | Visibility | Updated.
  Public/Runtime/Agent show "—/unknown" until probe + runtime-projection phases populate them.
- Sidebar: "Sites & Apps" added under Admin. Theme via hsl(var(--*)) semantic variables.

## NOT deployed yet
Dashboard + sidebar are shared src/ → need a core (+ zone) build to go live. TUI changes are
hot-reloaded (dev). Migration is LIVE on Supabase now. All on a dirty tree — clean commits pending.

## Next phases (from the plan)
- Phase 3 synchronizer (control.db → catalog, idempotent, seed-on-insert, flag-missing)
- Phase 4 scoped ingestion endpoint (the real security piece — scoped write token, not service-role)
- Phase 5 probes, Phase 6 runtime projection → light up the Public/Runtime/Agent columns
- Phase 8 public consumer view (anon-safe, visibility=public only) + move footer to visibility rules
