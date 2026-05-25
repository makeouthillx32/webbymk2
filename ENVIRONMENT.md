# UNAXIS Environment System

> **Last updated:** 2026-05-23  
> **Covers:** two-machine setup, both agent implementations, auth model, update flows, Portainer legacy compatibility, and Supabase environment store.

---

## Table of Contents

1. [Overview — Two Machines, Two Agent Flavours](#1-overview)
2. [Physical Setup: POWER and L0V3](#2-physical-setup)
3. [The Environment Record (Supabase)](#3-the-environment-record)
4. [Agent Implementations](#4-agent-implementations)
   - 4a. [Embedded Agent — POWER (`proxy/server.js`)](#4a-embedded-agent--power)
   - 4b. [Standalone Agent — L0V3 (`packages/agent-node/`)](#4b-standalone-agent--l0v3)
5. [Auth Model — TOFU ECDSA P-256](#5-auth-model)
6. [TUI Client — `agent-client.ts`](#6-tui-client)
7. [Agent Update Flows](#7-agent-update-flows)
   - 7a. [POWER: bind-mount hot-reload](#7a-power-update-flow)
   - 7b. [L0V3: self-update + updater container](#7b-l0v3-update-flow)
   - 7c. [Future: POWER self-update via GHCR](#7c-future-power-self-update)
8. [The Updater Container (`packages/agent-updater/`)](#8-the-updater-container)
9. [Portainer Legacy Compatibility](#9-portainer-legacy-compatibility)
10. [Environment Type Routing in the TUI](#10-environment-type-routing)
11. [Key File Map](#11-key-file-map)

---

## 1. Overview

UNAXIS manages Docker infrastructure across multiple machines. Each machine is an **environment** — a live infrastructure node. The TUI runs on POWER and talks to every environment simultaneously through a uniform agent HTTP API.

```
┌─────────────────────────────────────────────────────────┐
│  POWER (dev machine)                                     │
│                                                          │
│  TUI (Bun / Ink)                                        │
│   │                                                      │
│   ├─── agentFetch() ──► http://127.0.0.1:8888  ◄──────┐ │
│   │                     unt_proxy (port 8888)          │ │
│   │                     embedded agent v0.1.0          │ │
│   │                                                    │ │
│   └─── agentFetch() ──► http://<L0VE_IP>:8888         │ │
│                         unaxis_agent (port 8888)       │ │
│                         standalone agent v0.1.9        │ │
└────────────────────────────────────────────────────────┘
```

Both agents speak the same HTTP API. The TUI uses the same `agentFetch()` / `dockerFetch()` calls for both. The only difference is where they run and how they are updated.

---

## 2. Physical Setup

| Property | POWER | L0V3 |
|---|---|---|
| Role | Dev machine — TUI runs here, all builds happen here | Remote agent host |
| OS | Windows + Docker Desktop (WSL2) | Windows + Docker Desktop (WSL2) |
| Source code | `Z:\WEBSITES\webbymk2` lives here | No source code |
| Agent container | `unt_proxy` (part of main compose stack) | `unaxis_agent` (standalone) |
| Agent port | `127.0.0.1:8888` (localhost only) | `<L0VE_IP>:8888` (LAN) |
| Agent implementation | `proxy/server.js` (embedded, bind-mounted) | `packages/agent-node/agent.js` (pulled from GHCR) |
| Agent version | `0.1.0` | `0.1.9` |
| GHCR image | None — built locally, bind-mounted | `ghcr.io/makeouthillx32/unaxis-agent:v0` |
| Update mechanism | Edit `proxy/server.js` → `node --watch` restarts in ~1s | TUI `u` key → `POST /self-update` → updater container |
| Environment type | `local-docker` | `remote-docker` |

**Docker socket path inside containers:** Both machines use Docker Desktop with WSL2. Linux containers see the socket at `/var/run/docker.sock` (WSL2 provides it), NOT the Windows named pipe `//./pipe/docker_engine`.

---

## 3. The Environment Record

All environments live in Supabase (`public.environments`). Loaded by `src/ink/environment-store.ts`.

```typescript
interface UnaxisEnvironment {
  id:              string;
  name:            string;
  type:            "local-docker" | "remote-docker" | "azure" | "edge";

  // Agent connection
  agentUrl:        string;   // e.g. "http://127.0.0.1:8888"  or  "http://192.168.50.75:8888"
  agentPort:       number;   // default 8001 (legacy); agent-node uses 8888
  agentStatus:     "online" | "offline" | "unknown";
  agentLastSeenAt: string | null;
  agentVersion:    string;   // read from GET /health response
  agentTokenSecretId: string | null;

  // Misc
  isDefaultTarget: boolean;  // wizard pre-selects this env for new zone deploys
  active:          boolean;  // DEPRECATED — use isDefaultTarget
  machineRole:     string;   // display label e.g. "App · DB · Proxy · Zones"
  ...
}
```

**All environments are always live.** `isDefaultTarget` only controls which environment the zone wizard pre-selects — it does not mean other environments are inactive or unavailable.

### Environment types (Portainer-compatible numeric values)

| Type | Legacy numeric | Meaning |
|---|---|---|
| `local-docker` | 1 — DockerEnvironment | POWER: agent embedded in local stack |
| `remote-docker` | 2 — AgentOnDockerEnvironment | L0V3: standalone agent container |
| `azure` | 3 — AzureEnvironment | Not yet used |
| `edge` | 4 — EdgeAgentOnDockerEnvironment | Not yet used |

---

## 4. Agent Implementations

Both agents expose an identical HTTP API on port 8888. The TUI cannot tell them apart at the protocol level — only the environment type and update path differ.

### Agent API surface (both implementations)

```
GET  /health              → { status, version, platform }
GET  /docker/dashboard    → aggregated dashboard (containers/images/volumes/networks/stacks/info)
*    /docker/*            → transparent proxy to /var/run/docker.sock
POST /self-update         → (standalone agent only, v0.1.4+) initiate container self-replacement
POST /stacks/deploy       → (standalone agent only) run docker compose up -d
```

---

### 4a. Embedded Agent — POWER

**File:** `proxy/server.js` (lines 301–712)  
**Container:** `unt_proxy`  
**Compose service:** `proxy` in `docker-compose.yml`

The proxy container is a single Node.js process running three HTTP servers:

| Server | Port | Bind | Purpose |
|---|---|---|---|
| Reverse proxy | 3080 | `0.0.0.0` | Routes web traffic to zones by Host header |
| Admin API | 3081 | `0.0.0.0` | `POST /reload` + `GET /health` for TUI route updates |
| **UNAXIS agent** | **8888** | **`0.0.0.0`** | **Docker socket proxy for TUI** |

Docker-compose maps port 8888 to **`127.0.0.1:8888` only** — it is not exposed to the network. Only the local TUI can reach it.

The agent has the Docker socket mounted:
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**No `/self-update` endpoint** — the proxy image has no published GHCR tag, so there is nothing to pull. Updates happen via bind-mount + `node --watch` (see §7a).

**TOFU pairing state** is stored in `/proxy-config/agent-state.json` (bind-mounted from `./proxy-config/` on the host). This means pairing survives container restarts and `docker compose up -d --build` rebuilds.

---

### 4b. Standalone Agent — L0V3

**Files:** `packages/agent-node/agent.js` + `packages/agent-node/handler/`  
**Container:** `unaxis_agent`  
**Image:** `ghcr.io/makeouthillx32/unaxis-agent:v0`  
**Current version:** `0.1.9`

The standalone agent is a pure Node.js process (no Bun, no npm dependencies) running a single HTTP server on port 8888.

Key capabilities beyond the embedded agent:

- **`POST /self-update`** — initiates a safe container self-replacement via a helper updater container (see §7b and §8). Requires v0.1.4+.
- **`POST /stacks/deploy`** — runs `docker compose up -d` with a provided YAML string.
- **Concurrent update lock** — prevents two simultaneous self-updates.
- **Updater log streaming** — agent attaches to the updater container's log stream and forwards each line to the agent logger while the replacement is in progress.

**TOFU pairing state** is stored in `/data/agent-state.json` (volume `unaxis_agent_data`).

Deploy command on L0V3:
```powershell
docker run -d `
  --name unaxis_agent `
  --restart unless-stopped `
  -p 8888:8888 `
  -v /var/run/docker.sock:/var/run/docker.sock `
  -v unaxis_agent_data:/data `
  ghcr.io/makeouthillx32/unaxis-agent:v0
```

---

## 5. Auth Model

Both agents use **TOFU (Trust on First Use) with ECDSA P-256**. This is the same scheme Portainer uses for its agent protocol.

### Pairing flow

```
First connection:
  TUI ──► X-PortainerAgent-PublicKey: <raw P-256 pub key, base64>
          X-PortainerAgent-Timestamp: <unix seconds>
          X-PortainerAgent-Signature: ECDSA-SHA256(private_key, timestamp) base64
  Agent ─ stores public key to state file ─► "TOFU: paired ✓"

All subsequent requests:
  TUI ──► X-PortainerAgent-Timestamp: <unix seconds>
          X-PortainerAgent-Signature: ECDSA-SHA256(private_key, timestamp) base64
          (public key header still sent but ignored after pairing)
  Agent ─ verifies ECDSA signature against stored public key
          rejects if |now - timestamp| > 5 minutes (replay protection)
```

### TUI key pair

The TUI's P-256 key pair is generated on first run and persisted to:
```
{ARTIFACT_STORE_DIR}/agent/tui-keypair.json
```
Format: `{ privateKeyJwk, publicKeyB64 }`. The same key pair is used for all environments — one TUI identity, many agents.

### Zero-config deploy

No `AGENT_SECRET` env var. No pre-shared credentials. Deploy the agent container, point the TUI at it, and the first connection pairs automatically.

---

## 6. TUI Client

**File:** `src/ink/agent-client.ts`

All agent communication goes through two functions:

```typescript
agentFetch(env, "/path", init?)   // signed fetch to env.agentUrl
dockerFetch(env, "/path", init?)  // signed fetch to env.agentUrl + /docker
```

Both attach the ECDSA headers automatically. Higher-level helpers built on top:

| Function | What it does |
|---|---|
| `pingAgent(env)` | `GET /health` → `AgentHealthResult` |
| `fetchDashboard(env)` | `GET /docker/dashboard` → `DashboardResponse` |
| `fetchContainers(env)` | `GET /docker/containers/json?all=1` |
| `fetchImages(env)` | `GET /docker/images/json` |
| `fetchVolumes(env)` | Two-call dangling detection (mirrors Portainer) |
| `fetchNetworks(env)` | `GET /docker/networks` |
| `containerAction(env, id, verb)` | `POST /docker/containers/{id}/{verb}` |
| `removeContainer/Image/Volume/Network` | `DELETE` calls |
| `fetchContainerStats(env, id)` | One-shot stats, Portainer CPU delta formula |
| `fetchContainerLogs(env, id, tail)` | Log text, 8-byte frame header stripped |
| `inspectContainer(env, id)` | Full inspect JSON |
| `createContainer/Volume/Network` | Create resources |
| `pullImage(env, image, tag, onLine)` | Streaming pull via `POST /docker/images/create` |
| `deployStack(env, name, yaml, onLine)` | `POST /stacks/deploy` (standalone only) |

---

## 7. Agent Update Flows

### 7a. POWER Update Flow

POWER's agent is embedded in `proxy/server.js`, which is **bind-mounted** into the container:

```yaml
# docker-compose.yml
proxy:
  volumes:
    - ./proxy/server.js:/proxy/server.js:ro
```

The Dockerfile runs `node --watch server.js`. This means:

1. Edit `proxy/server.js` on the host (POWER's disk)
2. Node detects the file change
3. Process restarts in ~1 second
4. New code is live — zero container replacement needed

**To update POWER's embedded agent version:**
- Bump `AGENT_VERSION` constant in `proxy/server.js`
- Save the file
- `--watch` restarts the process
- TUI `p` ping immediately shows the new version

**When does a container rebuild happen?**  
Only when the proxy image itself needs to change (e.g. new npm dependency, Node version bump). In that case: `docker compose up -d --build proxy`. TOFU pairing state survives because it lives in the bind-mounted `./proxy-config/agent-state.json`.

### 7b. L0V3 Update Flow

L0V3's standalone agent self-updates via a detached helper container. The TUI `u` key triggers a two-phase operation:

```
Phase 1 — on POWER:
  TUI → docker build -t ghcr.io/makeouthillx32/unaxis-agent:v0 packages/agent-node/
  TUI → docker build -t ghcr.io/makeouthillx32/unaxis-updater:v0 packages/agent-updater/
  TUI → docker login ghcr.io (uses stored PAT from credential store)
  TUI → docker push ghcr.io/makeouthillx32/unaxis-agent:v0
  TUI → docker push ghcr.io/makeouthillx32/unaxis-agent:<version>  (pinned tag)
  TUI → docker push ghcr.io/makeouthillx32/unaxis-updater:v0
  TUI → docker push ghcr.io/makeouthillx32/unaxis-updater:<version>

Phase 2 — on L0V3 (via agent HTTP API):
  TUI → POST /self-update { ref: "ghcr.io/.../unaxis-agent:v0" }
  Agent:
    1. Pulls new agent image (Docker API, not spawn — avoids PATH issues)
    2. Pulls updater image
    3. Creates + starts updater container with docker.sock mounted
    4. Responds 202 (agent will die shortly)
    5. Streams updater container logs until killed

  Updater container (separate cgroup — survives agent being killed):
    1. Inspects running agent container → clones PORTS, BINDS, GROUPS, RESTART
    2. Renames old container → unaxis_agent_rollback, stops it
    3. Starts new container with cloned config + new image
    4. HTTP health check loop: 20 × 5s = 100s max
       - Gets container bridge IP via docker inspect
       - wget http://<bridge_ip>:8888/health
       - Fallback: docker inspect health status
    5a. Healthy → removes rollback container, exits 0
    5b. Unhealthy → stops new, rm, renames rollback back, starts it, exits 1

  TUI polls GET /health every 2s for up to 120s:
    - Checks health.version === expectedVersion (rollback detection)
    - Returns success or version-mismatch warning
```

**Why a helper container?** When Docker stops `unaxis_agent`, every process in that container's cgroup gets SIGKILL — including any in-process update logic. The updater runs in its own cgroup and is unaffected when the daemon stops the agent container.

### 7c. Future: POWER Self-Update

To give POWER parity with L0V3:

1. Add `image: ghcr.io/makeouthillx32/unt-proxy:v0` to the `proxy` service in `docker-compose.yml`
2. Add `POST /self-update` endpoint to `proxy/server.js` — same updater-container pattern, targeting `unt_proxy` as the container name
3. Extend `buildAndPushAgent()` in `agent-ops.ts` to build+push the proxy image as a third artifact
4. Extend `isRemote` routing in `Env/index.tsx` to detect `local-docker` with an `agentUrl` and run Phase 2 against it

Until then, POWER agent code changes deploy instantly via the bind-mount + `--watch` path, which is actually faster and simpler than the GHCR pull approach.

---

## 8. The Updater Container

**Files:** `packages/agent-updater/updater.sh` + `packages/agent-updater/Dockerfile`  
**Image:** `ghcr.io/makeouthillx32/unaxis-updater:v0`

A minimal Alpine + docker-cli image. The entrypoint `updater.sh` takes two arguments:
```
updater.sh <container_name> <new_image_ref>
```

The agent creates it with `AutoRemove: true` — it removes itself when `updater.sh` exits.

```dockerfile
FROM alpine:3.20
RUN apk add --no-cache docker-cli
COPY updater.sh /updater.sh
RUN chmod +x /updater.sh
ENTRYPOINT ["/updater.sh"]
CMD ["unaxis_agent"]
```

Key design points:

- **Config cloning:** Inspects the running container with `docker inspect --format` to extract ports, volume binds, group-adds, and restart policy. The new container gets the exact same config — no hardcoded flags.
- **Bridge IP health check:** Does not rely on Docker's built-in `HEALTHCHECK` status (which uses `wget localhost` — unreliable on Windows Docker Desktop due to Alpine DNS resolution). Instead gets the container bridge IP via `docker inspect` and hits `http://<bridge_ip>:8888/health` directly.
- **Rollback:** Preserves the old container as `<name>_rollback` throughout the update. On health failure it stops the new container, removes it, renames the rollback back, and restarts it.
- **Pinned tags:** `agent-ops.ts` pushes both `:v0` (mutable) and `:<version>` (pinned, e.g. `:0.1.9`) on every build. The mutable tag is what the updater pulls; the pinned tag preserves rollback history.

---

## 9. Portainer Legacy Compatibility

UNAXIS was bootstrapped from Portainer's architecture. Several design decisions maintain intentional compatibility so the legacy Portainer layer (`src/legacy/portainer/`) can interop during migration.

| UNAXIS concept | Portainer equivalent |
|---|---|
| `EnvironmentType` numeric values | `EndpointType` (1=Docker, 2=Agent, 3=Azure, 4=Edge) |
| `X-PortainerAgent-Timestamp` header | Portainer agent auth header |
| `X-PortainerAgent-Signature` header | Portainer agent auth header |
| `X-PortainerAgent-PublicKey` header | Portainer TOFU pairing header |
| `DashboardResponse` shape | `dashboardResponse` struct in `api/http/handler/docker/dashboard.go` |
| `ContainerStats` CPU delta formula | `containerStatsController.js` delta formula |
| Log 8-byte frame strip regex | `logs.substring(8).replace(/\r?\n(.{8})/g, '\n')` |
| `fetchVolumes` two-call dangling | `images_list.go` imageUsageSet pattern |

The `X-Unaxis-Agent` response header distinguishes UNAXIS agents from Portainer agents:
- Embedded proxy: `x-unaxis-agent: v0-embedded`
- Standalone agent: `x-unaxis-agent: v0`

The old Portainer-connected environments used `AGENT_SECRET` (HMAC-SHA256 shared secret). UNAXIS replaced this with TOFU ECDSA P-256 — same header names, stronger auth, zero pre-shared secrets.

---

## 10. Environment Type Routing in the TUI

**File:** `src/ink/panels/Env/index.tsx` — `handleUpdate()` (the `u` key handler)

```typescript
const isRemote = !!target.agentUrl && target.type === "remote-docker";

if (isRemote) {
  // L0V3: two-phase — build+push agent-node, then POST /self-update
  runOp(`Update agent → ${target.name}`, async (onLine) => {
    const buildCode = await buildAndPushAgent(onLine);   // Phase 1
    if (buildCode !== 0) return buildCode;
    return updateRemoteAgent(target, onLine);             // Phase 2
  });
} else {
  // POWER: build+push agent-node image only.
  // proxy/server.js changes deploy via node --watch — no container swap needed.
  // TODO: add Phase 2 once unt_proxy has a GHCR image + /self-update endpoint.
  runOp("Build + push agent image", (onLine) => buildAndPushAgent(onLine));
}
```

**`buildAndPushAgent()`** (`src/ink/agent-ops.ts`) always runs on POWER's local Docker socket:

1. `docker build -t ghcr.io/makeouthillx32/unaxis-agent:v0 packages/agent-node/`
2. `docker build -t ghcr.io/makeouthillx32/unaxis-updater:v0 packages/agent-updater/`
3. GHCR login (stored PAT via `getCredential("ghcr_token")`)
4. Push agent `:v0` + pinned `:<version>`
5. Push updater `:v0` + pinned `:<version>`

**`updateRemoteAgent()`** (`src/ink/agent-ops.ts`) calls `POST /self-update` on the target environment's agent and polls `/health` for up to 120 seconds. On success it verifies the reported version matches the just-built source version (rollback detection).

---

## 11. Key File Map

```
webbymk2/
├── proxy/
│   ├── server.js              ← POWER embedded agent (bind-mounted, --watch)
│   ├── Dockerfile             ← FROM node:20-alpine, CMD node --watch server.js
│   └── package.json
│
├── proxy-config/
│   ├── routes.json            ← Zone routing table (hot-reloaded by proxy)
│   └── agent-state.json       ← POWER TOFU pairing state (persists across rebuilds)
│
├── packages/
│   ├── agent-node/
│   │   ├── agent.js           ← L0V3 standalone agent (v0.1.9)
│   │   ├── handler/           ← Route handlers (docker/dashboard, stacks/deploy, self-update)
│   │   └── Dockerfile         ← FROM node:22-alpine, HEALTHCHECK 127.0.0.1
│   │
│   └── agent-updater/
│       ├── updater.sh         ← Config-cloning stop→rename→run→health→rollback
│       └── Dockerfile         ← FROM alpine:3.20 + docker-cli
│
├── src/ink/
│   ├── agent-client.ts        ← All TUI↔agent HTTP calls (agentFetch, dockerFetch, helpers)
│   ├── agent-ops.ts           ← Build/push pipeline + updateRemoteAgent()
│   ├── environment-store.ts   ← Supabase environments table, ping, save status
│   └── panels/Env/index.tsx   ← TUI environment panel (u=update, p=ping, etc.)
│
├── src/config/
│   ├── zones.ts               ← PROXY constant (unt_proxy, port 3080), GHCR_USER
│   └── stack.ts               ← PROJECT_DIR, ARTIFACT_STORE_DIR
│
└── docker-compose.yml         ← Main stack: unt_db, unt_kong, unt_auth, unt_rest,
                                             unt_realtime, unt_storage, unt_proxy, unt_app
```

### GHCR images

| Image | Tag | Source | Used by |
|---|---|---|---|
| `ghcr.io/makeouthillx32/unaxis-agent` | `:v0` + `:<version>` | `packages/agent-node/` | L0V3 `unaxis_agent` container |
| `ghcr.io/makeouthillx32/unaxis-updater` | `:v0` + `:<version>` | `packages/agent-updater/` | L0V3 helper updater container (AutoRemove) |
| `ghcr.io/makeouthillx32/unenter` | `:latest` | repo root `Dockerfile` | POWER + L0V3 `unt_app` zone |
| *(planned)* `ghcr.io/makeouthillx32/unt-proxy` | `:v0` | `proxy/` | Would enable POWER self-update parity |

---

*This document describes the system as of agent v0.1.9. Update the version table and update flow diagrams when the proxy gains a GHCR image and `/self-update` support.*
