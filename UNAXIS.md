# UNAXIS — Architecture & Current State
> Unified Next App eXecution & Infrastructure System  
> Last updated: 2026-05-24

---

## What UNAXIS Is

UNAXIS is the control plane for the unenter.live multi-zone production stack.
It is a TUI (terminal UI) built in Ink/React that runs on POWER (the dev machine)
and manages the entire lifecycle of the stack: zones, proxy, database, NPM,
environments, and infrastructure agents — all through a single keyboard-driven
interface with a live status overlay.

The philosophy: **no invisible ops**. Every action taken by UNAXIS is a visible
stack item in the TUI. The human sees what is happening in real time.

---

## Two-Machine Setup

| Machine | Role | IP |
|---------|------|-----|
| **POWER** | Dev machine. Runs the TUI, Docker Desktop (Windows), core containers, proxy, app, DB. | `192.168.50.204` |
| **L0V3** | Remote agent host. Runs NPM (Nginx Proxy Manager), Mail, AI services, and the standalone agent container. | `192.168.50.75` |

Both machines are on the same LAN. POWER is the default deployment target.
L0V3 handles SSL termination and public DNS routing via NPM.

---

## Stack Overview

```
Internet
  │
  ▼
L0V3 — Nginx Proxy Manager (:80/:443)
  │  SSL termination + Let's Encrypt certs
  │  Proxy host per zone → http://192.168.50.204:3080
  │
  ▼
POWER — unt_proxy container (:3080)
  │  Node.js reverse proxy (proxy/server.js)
  │  Routes by Host header from routes.json (hot-reload, no restart)
  │  Admin API on :3081 (route reload, health)
  │  Agent embedded: proxy/agent.js (bind-mounted, node --watch)
  │
  ├── unt_app:3000        unenter.live / www.unenter.live
  ├── unt_blog:3000       blog.unenter.live
  ├── unt_shop:3000       shop.unenter.live
  ├── unt_auth_zone:3000  auth.unenter.live
  ├── unt_min:3000        min.unenter.live
  ├── unt_apptest1:3000   apptest1.unenter.live
  ├── unt_yayy:3000       yayy.unenter.live
  ├── unt_running:3000    running.unenter.live
  ├── unt_rappers:3000    rappers.unenter.live
  ├── unt_onemore:3000    onemore.unenter.live
  └── unt_logs:3000       logs.unenter.live
  │
  └── unt_db:5432         Supabase (PostgreSQL + API + Studio)
```

---

## Agent System

The agent is the bridge between the TUI and remote Docker environments.
It exposes a signed HTTP API that the TUI uses to issue Docker commands,
deploy stacks, and self-update without requiring SSH.

### Unified Agent — One Source of Truth

`proxy/agent.js` is the **single source of truth** for the agent.
There are two deployment modes — both run identical code:

| Mode | Where | How |
|------|-------|-----|
| **Embedded** | POWER inside `unt_proxy` | Bind-mounted from `proxy/agent.js`. `node --watch` hot-reloads on save. No image rebuild needed. |
| **Standalone** | L0V3 as `unaxis_agent` container | Built into GHCR image `ghcr.io/makeouthillx32/unaxis-agent:v0` via `packages/agent-node/Dockerfile`. Deployed via `/self-update`. |

**Why one source?** Before unification, the proxy had its own version counter and
the standalone agent had its own. Version parity was impossible to verify.
Now when both nodes ping `:8888/health`, they return the same `AGENT_VERSION`
constant from the same file.

**Current version:** `v1.0.0`

### Agent Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Returns `{ status, version, platform }`. Used by TUI `[p]` ping. |
| `/docker/*` | * | Proxied to Docker daemon socket. Full Docker API access. |
| `/docker/dashboard` | GET | Aggregated container + image stats for TUI infra panel. |
| `/stacks/deploy` | POST | Deploy a compose YAML string (pull + up). Used by zone deploy pipeline. |
| `/self-update` | POST | Pull new agent image and atomically replace own container. |

### Agent Updater

`packages/agent-updater/` — a helper container (`unaxis-updater`) that the agent
spawns during a self-update. It handles:

1. Pulls the new agent image from GHCR
2. Verifies the new container starts healthy (HTTP poll on `:8888/health`)
3. Removes the old (rollback) container on success
4. Rolls back to the previous image if the new container fails health checks

### TOFU Pairing

The TUI pairs with each agent using TOFU (Trust On First Use) ECDSA P-256.
The first TUI to connect to an agent claims it by exchanging a signed challenge.
State is persisted to:
- POWER: `/proxy-config/agent-state.json` (inside `unt_proxy`)
- L0V3: `/data/agent-state.json` (inside `unaxis_agent`)

Pairing can be reset from the proxy action panel with `[k] Reset pairing`.

### Build & Push Flow

TUI `home › core` → Proxy → `[a] Push agent`:
1. Builds `ghcr.io/makeouthillx32/unaxis-agent:v0` from `proxy/agent.js`
2. Builds `ghcr.io/makeouthillx32/unaxis-updater:v0` from `packages/agent-updater/`
3. Pushes both with versioned tags: `:v0`, `:YYYY-MM-DD-HHmm`, `:semver`
4. After push, go to `home › env` → highlight L0V3 → `[u]` to deploy the new agent

---

## Environment System

Inspired by Portainer's environment model. Each environment is a live node
with its own agent, Docker socket, and set of services.

Environments are stored in the Supabase `environments` table.
`is_default_target` marks which environment POWER's TUI targets by default.

| Environment | Type | Agent URL | Services |
|-------------|------|-----------|---------|
| **POWER** | Local | `http://127.0.0.1:8888` | App · DB · Proxy · Zones |
| **L0V3** | Remote | `http://192.168.50.75:8888` | NPM · Mail · AI |

TUI panel: `home › env`
- `[p]` Ping agent — shows version + online status
- `[u]` Update agent — triggers `/self-update` on that environment's agent
- `[d]` Set default — changes `is_default_target`

---

## Proxy

The proxy is `unt_proxy` — a Node.js HTTP server (`proxy/server.js`) that:

- Routes by `x-forwarded-host` (set by NPM) or `Host` header
- Loads routes from `proxy-config/routes.json` (hot-reload via poll + fs.watch)
- Falls back to `UPSTREAM_*` env vars if routes.json is absent
- Preserves original Host header (`changeOrigin: false`) so zone middleware can read it
- Sets `x-forwarded-host` if not already present (direct connections)

### routes.json

Lives at `proxy-config/routes.json` (bind-mounted into `unt_proxy`).
Shape:
```json
{
  "coreDomain":   "unenter.live",
  "coreUpstream": "http://unt_app:3000",
  "zones": {
    "blog":  "http://unt_blog:3000",
    "logs":  "http://unt_logs:3000"
  }
}
```

The TUI writes this file directly when zones are added or removed.
The proxy hot-reloads in ~100ms with zero downtime.

### Proxy Action Panel (`home › core` → Proxy → `↵`)

| Key | Action | Description |
|-----|--------|-------------|
| `[r]` | Restart | Recreate container — picks up env changes |
| `[b]` | Build proxy | Rebuild proxy Docker image + recreate |
| `[R]` | Rebuild proxy (clean) | `--no-cache` rebuild |
| `[a]` | Push agent | Build `proxy/agent.js` → push both images to GHCR |
| `[l]` | Logs | Tail container output |
| `[k]` | Reset pairing | Clear TOFU state |
| `[s]` | Sync routes | Rebuild routes.json from all active zone containers |
| `[f]` | Audit NPM | Verify all zone NPM hosts point to correct upstream |

`[b]` and `[a]` are deliberately separate — building the proxy image does not
touch the agent, and pushing the agent does not rebuild the proxy image.

---

## Dev Mode

Each zone can run a dev container alongside its production container.
Dev zones are accessible at `dev.{zone}.unenter.live`.

The middleware detects `dev.*` subdomains via `isLocalDevelopmentHost()` and
uses path-based zone detection instead of host-based, so the dev container
runs the same middleware logic without spurious canonical redirects.

Dev containers are managed from the zones panel:
- Highlight a zone → `↵` → dev container actions (start / stop / restart)
- Dev containers mount the source directly for hot-reload
- Dev containers do not go through NPM — they are LAN-accessible only

---

## Zone System

### Zone Pipeline

When a new zone is created via the TUI wizard:

1. **Scaffold** — generate Dockerfile, package.json, page.tsx, layout.tsx,
   build.env, compose artifact, core page module
2. **Validate** — check generated files for known failure modes before
   handing off to Docker (fail fast, no 23s build waste)
3. **Build** — `docker build` from project root, push to GHCR with 3 tags
4. **Deploy** — `docker compose pull + up --force-recreate` via artifact store compose
5. **Health wait** — poll container until healthy or timeout
6. **NPM cert** — register proxy host in L0V3 NPM with Let's Encrypt
7. **Proxy restart** — hot-reload routes.json + force-recreate proxy

### Zone Scaffold Templates (`src/ink/zone-templates.ts`)

Generated per zone:
- `zones/{key}/Dockerfile` — multi-stage build with layout-aware core dir list
- `zones/{key}/package.json` — zone identity + dev port
- `zones/{key}/build.env` — explicit list of NEXT_PUBLIC_* build args
- `zones/{key}/src/app/page.tsx` — thin re-export wrapper
- `zones/{key}/src/app/layout.tsx` — zone root layout (Providers + ClientLayout)
- `stacks/{key}/docker-compose.yml` — UNAXIS artifact store compose file
- `src/zones/{key}/Page.tsx` — editable zone root page

### Scaffold Validator (`src/ink/zone/validate.ts`)

Runs after template generation, before Docker build. Checks:

| Rule | What it catches |
|------|----------------|
| `middleware-copy` | Missing `COPY middleware.ts ./` in Dockerfile → build fails with "Module not found" |
| `env-file-absolute` | Relative `../../.env` in compose artifact → deploy fails, wrong path |
| `dynamic-zone-guard` | `getCanonicalHost` missing subdomain fallback → zone 301-redirects to www |
| `service-name` | Generated compose doesn't reference the expected service name |
| `image-name` | Generated compose doesn't reference the expected image |

### Artifact Store

Zone compose files live **outside the repo** in the UNAXIS artifact store,
mirroring Portainer's `/data/compose/{id}/` pattern.

```
Windows:     %APPDATA%\unenter\stacks\{key}\docker-compose.yml
macOS/Linux: ~/.unenter/stacks/{key}/docker-compose.yml
```

The repo stays clean. Compose state is owned by the control plane.

### GHCR Image Naming

Every zone build produces three tags:
- `:latest` — mutable, always the most recent build
- `:YYYY-MM-DD-HHmm` — immutable date snapshot (rollback target)
- `:v{semver}` — immutable UNAXIS version tag

---

## Multi-Zone Middleware

`middleware.ts` (root) → re-exported from `src/middleware.ts` into every zone build.

Responsibilities (in order):
1. `www → canonical` redirect — any unknown host redirects to www.unenter.live,
   UNLESS it is a `*.unenter.live` subdomain (dynamic zones pass through)
2. Zone detection — from `x-forwarded-host` in production, path in local dev
3. Locale stripping — `en`/`de` prefix handling
4. Zone prefix rewrite — for zones that own a path prefix on a subdomain
5. Supabase auth + protected route enforcement

### Dynamic Zone Support

`getZoneFromHost()` in `src/lib/multiZone.ts` returns the subdomain key for
any `*.unenter.live` host not in the static `ZONES` map — e.g. `"logs"` for
`logs.unenter.live`. `getZoneConfig(key)` returns a safe default config
(requiresAuth:false, routePrefixes:["/"]) for those zones so middleware never
misidentifies or wrongly redirects a dynamically scaffolded zone.

---

## Key Files

| File | Purpose |
|------|---------|
| `proxy/agent.js` | Unified agent — single source of truth for both POWER and L0V3 |
| `proxy/server.js` | Multi-zone reverse proxy with hot-reload |
| `proxy-config/routes.json` | Live routing table (bind-mounted, hot-reloaded) |
| `docker-compose.yml` | Core stack: app, db, kong, proxy |
| `packages/agent-node/Dockerfile` | Builds standalone agent image from `proxy/agent.js` |
| `packages/agent-updater/` | Self-update helper: pulls new image, health-checks, rollback |
| `src/ink/zone-templates.ts` | All zone scaffold template generators |
| `src/ink/zone/scaffold.ts` | Zone scaffold orchestrator |
| `src/ink/zone/validate.ts` | Scaffold output validator |
| `src/ink/zone-pipeline.ts` | Full zone lifecycle: scaffold → build → deploy → NPM → proxy |
| `src/ink/agent-ops.ts` | Build + push agent and updater images |
| `src/ink/environment-store.ts` | Environment model, agent health, Supabase sync |
| `src/lib/multiZone.ts` | Zone registry, host resolution, canonical redirect logic |
| `middleware.ts` | Multi-zone Next.js middleware (shared by all zone builds) |
| `SMOKE-TEST.md` | Manual TUI smoke test targeting proxy/agent changes |
| `HARDENING.md` | Forward-looking hardening plan |
