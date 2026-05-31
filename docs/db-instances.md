# UNAXIS — Runtime Database Instances

> **Canonical reference for the Supabase instance control plane.**
> Covers: creation, lifecycle, snapshots, clone/restore, NPM proxy integration, MCP config.

---

## Overview

UNAXIS manages two tiers of Supabase database:

| Tier | Description | Docker project | Public domain |
|---|---|---|---|
| **Core** | The platform's own Supabase stack | `unenter` (prefix `unt_`) | `db.unenter.live` |
| **Instance** | Independent tenant/lab databases | `{slug}-{timestamp}` | `db.{slug}.unenter.live` |

Core is sacred — it holds platform data. Instances are branches: experiments, client databases, staging environments, or traffic-offload peers. Both are full Supabase stacks; the distinction is metadata and management tier, not infrastructure.

---

## Instance Registry

All runtime instances are tracked in:

```
%APPDATA%\unaxis\unenter\instances.json
```

Each entry is a `RuntimeInstance` object:

```ts
{
  id:               string          // UUID v4
  name:             string          // human label ("My App")
  slug:             string          // compose project name ("myapp-1779854644075")
  containerPrefix?: string          // "unt_" for core; omit for instances (defaults to "{slug}-")
  status:           "active" | "stopped" | "error" | "creating" | ...
  healthState:      "healthy" | "degraded" | "down" | "unknown"
  snapshotState:    "none" | "pending" | "complete" | "error"
  createdAt:        string          // ISO-8601
  runtimePath:      string          // .../supabase-instances/{slug}/
  dockerPath:       string          // .../supabase-instances/{slug}/docker/
  ports:            RuntimePorts    // see below
  secrets:          RuntimeSecrets  // postgres pw, JWT secret, anon/service keys, dashboard pw
  studioUrl:        string          // http://127.0.0.1:{kong}/ for lean instances
  lastSnapshot?:    string          // ISO-8601
  npmApiUrl?:       string          // https://db.{slug}.unenter.live
  npmStudioUrl?:    string          // https://studio.{slug}.unenter.live
}
```

### Ports

```ts
{
  kong:      number   // Kong API gateway (primary; both db.* and studio.* NPM entries point here)
  kongSSL:   number   // Kong HTTPS
  postgres:  number   // direct Postgres (host-accessible)
  studio:    number   // allocated but not bound in lean instances (compat field)
  pooler:    number   // allocated, not used in lean template
  analytics: number   // allocated, not used in lean template
}
```

Ports are allocated in non-conflicting blocks using a hash of the creation timestamp. The full range used: `8000–12999`.

---

## Lean Instance Template

New instances use a 9-service Docker Compose template at:

```
src/ink/zone/templates/instance/docker-compose.yml
```

Services: `db`, `kong`, `auth`, `rest`, `realtime`, `imgproxy`, `storage`, `meta`, `studio`

Notably absent vs the full supabase/supabase template: `analytics`, `vector`, `pooler`, `edge-functions`. This keeps instances lean (~2 GB RAM) and fast to start (~20s to Postgres ready).

**Studio has no port binding.** It is only reachable through Kong via the dashboard route. This means there is a single public entry point per instance (the Kong port), and studio access is gated by HTTP basic-auth at the Kong layer.

---

## Kong Host-Based Routing

Each instance runs **Kong 2.8.1** configured via declarative config (`volumes/api/kong.yml`).

```
db.{slug}.unenter.live     →  Kong  →  /rest/v1, /auth/v1, /realtime/v1, /storage/v1
studio.{slug}.unenter.live →  Kong  →  /  (dashboard route, basic-auth gated, hosts: [studio.*])
```

The dashboard route has a `hosts:` restriction — it only matches requests where the `Host` header is `studio.{slug}.unenter.live`. Requests to `db.{slug}.unenter.live/` find no matching route and Kong returns `{"message":"no Route matched with those values"}`. This is the intended behavior: the API domain is API-only.

Kong config is generated fresh per instance by `generateKongYml()` in `supabase-factory.ts`. The anon/service role JWT keys are baked directly into `kong.yml` (Kong 2.8.1 does not support env var substitution in consumer credentials).

---

## Instance Lifecycle

### Create (blank)

**TUI:** `[n]` in Db panel → Instance Wizard  
**Function:** `createBlankDatabase(name, opts, onLine)` in `database-manager.ts`

Steps:
1. `createRuntimeInstance(name)` — scaffold lean template, allocate ports, generate secrets, write `.env` + `kong.yml`, register in `instances.json`
2. `docker compose up -d` under the new slug
3. Poll `pg_isready` — up to 60s
4. `addDatabaseRoutes()` — write to `proxy-config/routes.json`
5. `npmAddDatabaseHosts()` — create SSL proxy entries in NPM on L0VE
6. `writeMcpConfig()` — write `mcp-config.json` + `mcp-env.txt` with real keys (no placeholders)

Studio and migrations continue warming in background (~2–3 min after Postgres is ready).

### Create (from snapshot)

**TUI:** `[3]` Snapshots → select → `[k]` → Clone Wizard  
**Function:** `cloneFromSnapshot(bundlePath, name, opts, onLine)` in `database-manager.ts`

Same as blank creation but after the stack starts, `restoreInstance()` injects data from the source bundle before NPM and MCP registration. The clone always uses the lean template regardless of what compose file the source snapshot was captured from.

### Start / Stop / Restart

**TUI:** `[↵]` on instance → detail screen → `[x]` stop / `[r]` restart  
**Functions:** `startCoreStack()`, `stopCoreStack()`, `restartCoreStack()` in `supabase-factory.ts`

Uses `docker compose --project-name {slug} up/down` with the instance's `dockerPath` as cwd.

### Delete

**TUI:** `[d]` on instance in list  
**Function:** `deleteRuntimeInstance(instance, onLine)` in `db-api.ts`

Steps (in order):
1. `removeInstanceNpmHosts()` — delete `db.*` and `studio.*` NPM proxy hosts (SSL cert left in place — wildcard cert, no LE quota waste)
2. `docker compose down --volumes --remove-orphans` — containers + volumes removed
3. `rm -rf {runtimePath}` — filesystem cleanup
4. `removeFromRegistry(instance.id)` — deregister from `instances.json`

Non-fatal on NPM step (logs ⚠ and continues). If compose down fails, still attempts cleanup.

---

## Snapshot System

A snapshot bundle is a point-in-time capture of a running instance — database dump + storage objects + metadata + restore scripts.

**Captured by:** `snapshotInstance(instance, onLine)` in `zone/snapshot.ts`  
**Listed by:** `listSnapshots(instance)` — newest first  
**TUI:** `[s]` on any instance, or `[g]` to open the gallery

### Bundle Layout

```
backups/supabase-core/{slug}/{timestamp}/
  db.dump          # pg_dump custom-format (binary, pg_restore compatible)
  schema.sql       # pg_dump schema-only (human-readable reference)
  storage/         # docker cp of /var/lib/storage/
  env.redacted     # .env with all secrets replaced by <REDACTED>
  compose.yml      # copy of docker-compose.yml at capture time
  metadata.json    # instanceId, ports, studioUrl, container names, timestamp
  restore.sh       # Linux restore script
  restore.ps1      # Windows PowerShell restore script
  {timestamp}.tar.gz  # compressed archive of the above (created alongside)
```

The `.tar.gz` archive lives next to the bundle directory and is used for portability and seeding.

### Same-Instance Restore (rollback)

**TUI:** `[3]` Snapshots → select → `[r]`  
**Function:** `restoreInstance(bundlePath, onLine)` in `zone/snapshot.ts`

Steps:
1. `docker compose down` — full stack stopped
2. `docker compose up -d db` — DB container only
3. Poll `pg_isready`
4. `pg_restore` (streamed from `db.dump` via stdin pipe)
5. `docker cp storage/.` into storage container
6. `docker compose up -d --remove-orphans` — full stack restarted

⚠ This is destructive — existing data in the instance is replaced. Snapshot before restoring.

### Clone as New Instance

**TUI:** `[3]` Snapshots → select → `[k]` → Clone Wizard  
See [Create (from snapshot)](#create-from-snapshot) above.

---

## NPM Proxy Integration

Each instance gets two NPM (Nginx Proxy Manager) proxy host records on the L0VE node:

| Host | Upstream | Purpose |
|---|---|---|
| `db.{slug}.unenter.live` | `POWER_IP:{ports.kong}` | Kong API gateway |
| `studio.{slug}.unenter.live` | `POWER_IP:{ports.kong}` | Kong Studio dashboard |

Both entries point to the same Kong port. Kong uses the `Host` header to route internally.

SSL certificates use the existing wildcard `*.unenter.live` cert — no new Let's Encrypt requests are made per instance.

**Functions:** `npmAddDatabaseHosts()` (create), `removeInstanceNpmHosts()` (delete)  
**Re-register:** `reregisterInstanceNpm()` — idempotent, useful for fixing broken entries

---

## MCP Config

Every instance generates connection config for Claude's MCP (Model Context Protocol):

```
{instance.dockerPath}/mcp-config.json   — paste into claude_desktop_config.json → mcpServers
{instance.dockerPath}/mcp-env.txt       — plain env vars
```

The public URL used is `https://db.{slug}.unenter.live` (via Kong over NPM SSL). Real anon/service role keys are written at creation time — no placeholders.

---

## File Layout

```
webbymk2/
  supabase-instances/          # gitignored — runtime data + secrets
    {slug}/
      docker/
        docker-compose.yml     # lean 9-service template (instance-specific copy)
        .env                   # all secrets — NEVER commit
        volumes/
          api/kong.yml         # generated Kong config with baked-in keys
          db/                  # Postgres init SQL (copied from supabase-core at scaffold)
        mcp-config.json        # MCP connection config
        mcp-env.txt

  supabase-core/               # gitignored — cloned from github.com/supabase/supabase
    docker/                    # source of DB init SQL files only
    ...                        # rest of supabase/supabase repo (not used)

  backups/                     # gitignored — snapshot bundles
    supabase-core/
      {slug}/
        {timestamp}/           # bundle directory
        {timestamp}.tar.gz     # compressed archive
      templates/
        fresh-{date}.tar.gz    # vanilla seed templates

  src/ink/zone/
    supabase-factory.ts        # createRuntimeInstance, allocatePorts, generateKongYml
    database-manager.ts        # createBlankDatabase, cloneFromSnapshot, provisionDatabase
    snapshot.ts                # snapshotInstance, restoreInstance, cloneFromBundle, listSnapshots
    npm-api.ts                 # npmAddDatabaseHosts, npmDeleteHost, npmFindHost

  src/ink/zone/templates/
    instance/
      docker-compose.yml       # lean template (source of truth — committed)
```

---

## Key Design Decisions

**Why lean template instead of supabase-core clone?**  
The full supabase/supabase repo includes analytics (Logflare), vector (pgvector indexing), pooler (PgBouncer), and edge functions. These add ~4 services and significant RAM. For instances that serve as API backends or Studio workspaces, none of these are needed. The lean 9-service template starts faster and consumes ~40% less RAM.

**Why Kong for Studio auth, not NPM access lists?**  
NPM's `/api/access-lists` endpoint consistently returned 404 in testing. Kong's `basic-auth` plugin is more reliable and keeps auth closer to the stack itself — the same mechanism works whether accessed via NPM SSL or directly by IP.

**Why bake JWT keys into kong.yml?**  
Kong 2.8.1 declarative config does not support environment variable substitution in `consumers[].keyauth_credentials[].key` or `consumers[].basicauth_credentials[].password` fields. The keys must be literal values. The `generateKongYml()` function handles this at scaffold time.

**Why does Studio have no port binding?**  
Exposing Studio directly on a host port bypasses Kong auth. By routing Studio through Kong's dashboard route (which requires `basic-auth`), all Studio access is authenticated regardless of how the user reaches it.

---

## Operational Runbook

### Instance won't start
```
# Check compose logs
docker compose --project-name {slug} logs --tail 50

# Check Postgres specifically
docker exec {slug}-db pg_isready -U postgres
```

### NPM hosts left behind after delete
If delete failed partway through, hosts may remain in NPM. Run the cleanup PowerShell:
```powershell
# cleanup-{slug}-npm.ps1 (generated per incident)
# Or use the TUI: [n] on the instance → reregister NPM → then delete again
```

Or delete manually via NPM UI at `http://192.168.50.75:81`.

### Restore fails: pg_restore errors
`pg_restore` warnings about existing objects are normal (the `--clean --if-exists` flags handle drops). An exit code of 1 with only warnings is acceptable. An exit code of 2 indicates genuine errors — check the `pg:` prefixed lines in the TUI output.

### Kong returns `no Route matched`
This is expected on `db.{slug}.unenter.live/` (root path). The dashboard route is host-restricted to `studio.{slug}.unenter.live`. If Kong returns this on the studio domain, restart the Kong container:
```
docker restart {slug}-kong
```
Then verify `volumes/api/kong.yml` has the correct `hosts:` entry under the dashboard route.

### Instance shows in TUI but containers aren't running
```
unaxis unenter db instance {slug} verify
```
This will run `verifyRuntimeInstance()` and sync the health/status fields from actual Docker state.

---

## CLI Reference

All DB instance operations are available via `unaxis unenter db` — same functions as the TUI, streamed live via IPC.

### Instances

```bash
unaxis unenter db instances                          # list all runtime instances
unaxis unenter db instance list                      # same

unaxis unenter db instance <name> status             # container health summary
unaxis unenter db instance <name> logs [--tail 50]   # stream db/kong/studio logs
unaxis unenter db instance <name> start              # start all containers
unaxis unenter db instance <name> stop               # stop all containers
unaxis unenter db instance <name> restart            # stop + start
unaxis unenter db instance <name> verify             # deep health check, sync registry state
unaxis unenter db instance <name> npm               # re-register NPM proxy hosts (idempotent)
```

### Create

```bash
# New blank instance (lean template, NPM + MCP wired automatically)
unaxis unenter db blank <slug> [--name "Human Label"] [--no-npm]

# Clone an existing instance or core into a new independent instance
unaxis unenter db clone <source-name> <new-name> [--no-npm]
unaxis unenter db clone core "Production Backup"     # clone the core database
unaxis unenter db clone yapp "Yapp Staging"          # clone a runtime instance
```

`db clone` automatically snapshots the source first, then provisions a fresh lean instance and restores the data into it. The clone gets its own ports, secrets, NPM hosts, and MCP config.

### Snapshots

```bash
unaxis unenter db instance <name> snapshot           # capture full bundle (db + storage + metadata)
unaxis unenter db instance <name> snapshots          # list all captured bundles for this instance

unaxis unenter db snapshot                           # snapshot core DB
unaxis unenter db snapshot --slug <name>             # snapshot a specific instance
unaxis unenter db snapshots                          # list all snapshots (core + all instances)
unaxis unenter db snapshots --slug <name>            # list snapshots for one instance
```

### Restore

```bash
# Restore an instance from a bundle (destructive — stops stack, replaces data, restarts)
unaxis unenter db instance <name> restore --bundle <path-to-bundle-dir>

# Restore core
unaxis unenter db restore --bundle <path>
```

Get bundle paths from `db instance <name> snapshots` — each line shows the path.

### Delete

```bash
# Full delete: NPM hosts removed, volumes destroyed, files removed, registry deregistered
unaxis unenter db instance <name> delete --confirm

# Soft remove: stops containers, deregisters, keeps volumes on disk
unaxis unenter db instance <name> remove --confirm
```

Always snapshot before deleting:
```bash
unaxis unenter db instance myapp snapshot && unaxis unenter db instance myapp delete --confirm
```

### Core DB

```bash
unaxis unenter db backup                             # quick pg_dump of core (DB only)
unaxis unenter db snapshot                           # full core snapshot (DB + storage + metadata)
unaxis unenter db snapshots                          # list core snapshots
unaxis unenter db restore --bundle <path>            # restore core from bundle
unaxis unenter db clone core "My Clone" [--no-npm]  # clone core into new independent instance
```

### Other

```bash
unaxis unenter db templates                          # list available fresh seed templates
unaxis unenter db template-capture [--force]         # capture a fresh vanilla Supabase template
unaxis unenter db smoke-test                         # end-to-end test: blank → verify → snapshot → teardown
```
