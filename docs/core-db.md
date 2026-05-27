# UNAXIS — Core Database

> The platform's own Supabase stack. This is what `unt_db`, `unt_studio`, `unt_kong`, etc. refer to.
> Distinct from **runtime instances** (see `docs/db-instances.md`).

---

## What "Core" Means

The core Supabase stack is the platform database — it stores the data that UNAXIS itself depends on (users, projects, app state). It runs as part of the root `docker-compose.yml` under the `unenter` compose project with the `unt_` container prefix.

```
Core access points (local):
  Postgres   127.0.0.1:5432
  Kong API   127.0.0.1:8001   →  https://db.unenter.live
  Studio     127.0.0.1:3002   →  https://studio.unenter.live
```

Unlike runtime instances, the core stack is always present. The TUI surfaces it in the **Db panel → [1] Core** section separately from instances.

---

## Backup

### pg_dump (quick backup, DB only)

**TUI:** `[b]` in Db panel Core section  
**Function:** `backupDatabase(onLine)` in `db-api.ts`

Runs `pg_dump` inside `unt_db` and copies the result to `backups/`. Fast, DB-only, no storage objects.

### Full snapshot (DB + storage + metadata)

**TUI:** `[1]` Core → `[3]` Snapshots → core snapshots appear there  
**Function:** `snapshotInstance(CORE_INSTANCE, onLine)` in `zone/snapshot.ts`

Captures everything: `db.dump`, `schema.sql`, `storage/`, `env.redacted`, `compose.yml`, restore scripts, `.tar.gz` archive. Core snapshots land in `backups/supabase-core/unenter/`.

**Important:** The core snapshot path is the same code used for instances — `CORE_INSTANCE` is a synthetic `RuntimeInstance` descriptor with `slug: "unenter"` and `dockerPath: PROJECT_DIR`. This means the restore scripts it generates will also work for core.

---

## Restore

Restoring core is more consequential than restoring an instance — the platform is down during the process. The steps are the same as instance restore (`restoreInstance()`):

1. `docker compose down` — **full platform goes offline**
2. Bring up `unt_db` only
3. `pg_restore` from bundle
4. Restore storage objects
5. `docker compose up -d` — platform back online

Plan for ~2–5 min downtime. Always snapshot first.

> The TUI `[r]` restore from Snapshots section works for core bundles. It identifies the target by `meta.instanceId` which maps to the core registry entry.

---

## Upgrade (Safe Pattern)

When bumping Supabase image versions in `docker-compose.yml`:

```
1. Snapshot core (full bundle)
2. docker compose pull          # pull new images
3. docker compose up -d         # Supabase runs migrations on first boot
4. Verify: Studio loads, Kong /health returns 200
5. If bad: restore from step-1 bundle
```

The risky moment is step 3 — Supabase auto-runs schema migrations which may take 30–60s and can fail on bad image combos. Keep the snapshot from step 1 until you've verified the upgrade held for at least a session.

**Blue/green upgrade** (zero-downtime):
1. Create a new blank instance (`createBlankDatabase`)
2. Restore latest core snapshot into it (`restoreInstance`)
3. Bring it up with the new image tags
4. Smoke test via its local Kong port
5. Flip the NPM `db.unenter.live` proxy target to the new instance port
6. Tear down the old core once satisfied

This requires NPM manual intervention (changing the upstream IP/port for `db.unenter.live`) — not yet automated in the TUI.

---

## Multiple Cores (Future / Conceptual)

The current model is one Core → many Instances. If the core needs to scale:

### Read replica (horizontal reads)
Set up Postgres streaming replication from `unt_db` to a secondary Postgres container. Route read-only queries to the replica. Requires custom Kong config (separate routes for reads vs writes) and awareness in the application layer. Not yet implemented.

### Peer cores (independent platform DBs)
Each peer is a full independent Supabase stack — own data, own secrets, own set of tenant instances. Mechanically identical to what `createBlankDatabase()` already creates. The only missing piece is the TUI treating some instances as **platform-tier** (shown in the Core section, able to manage their own sub-instances) vs **tenant-tier**.

This would be implemented by adding a `tier: "platform" | "tenant"` field to `RuntimeInstance` and updating the Db panel to render platform-tier instances under `[1] Core` with their own sub-instance lists.

**Practical trigger:** When a single core is handling too much traffic, provision a second platform instance, migrate a subset of tenants to it, update their MCP configs to point at the new public URL. Each platform instance manages its own tenants independently.

---

## Internal Representation

Core is represented as a synthetic `RuntimeInstance` in the TUI:

```ts
const CORE_INSTANCE: RuntimeInstance = {
  id:              "core",
  name:            "Core Supabase",
  slug:            "unenter",       // compose project name
  containerPrefix: "unt_",          // containers: unt_db, unt_kong, ...
  status:          "active",
  healthState:     "unknown",
  snapshotState:   "none",
  runtimePath:     PROJECT_DIR,
  dockerPath:      PROJECT_DIR,
  studioUrl:       "http://127.0.0.1:3002/project/default",
  ports: { kong: 8001, kongSSL: 8002, postgres: 5432, studio: 3002, pooler: 0, analytics: 0 },
  secrets: { ... },  // read from PROJECT_DIR/.env at runtime
  createdAt:       "...",
};
```

This lets all snapshot/restore/verify functions work on core with the same code paths as instances — no special cases in the infrastructure layer.
