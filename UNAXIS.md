# UNAXIS — Definitive Architectural Spec & Operations Manual

> **Unified Next App eXecution & Infrastructure System**  
> *System Version: 0.2.0* · *Last Hardening Review: 2026-05-25*

---

```mermaid
graph TD
    subgraph L0V3 Node (Remote / Public IP)
        NPM["Nginx Proxy Manager (:80/:443)"]
        AgentL0V3["Unaxis Standalone Agent (:8888)"]
        NPM -.->|SSL Term. & Forward| Proxy
    end

    subgraph POWER Node (Local / Dev Machine)
        TUI["UNAXIS TUI (React / Ink)"]
        Proxy["unt_proxy (:3080)"]
        App["unt_app (:3000)"]
        DB["unt_db (:5432)"]
        Storage["unt_storage (:5000)"]
        Studio["unt_studio (:3002)"]
        
        TUI -->|IPC / TCP 50505| Proxy
        Proxy -->|Host-Header Route| App
        Proxy -->|Storage Redirect| Storage
        Proxy -->|Database Sync| DB
    end

    classDef host fill:#2d3748,stroke:#4a5568,color:#fff;
    classDef service fill:#1a202c,stroke:#2b6cb0,color:#fff;
    class NPM,Proxy,App,DB,Storage,Studio service;
```

---

## 1. The Core Paradigm: Project Names & Slugs

The control plane enforces strict directory isolation to support multiple independent environments on a single developer machine.

### 1.1 The Project Name and Slug Contracts
*   **The Project Name (`unenter`)**: This is the canonical name of the active project topology. It is declared as the explicit network namespace (`unenter`) and the Docker Compose project tag (`-p unenter`). This ensures that containers, networks, and volumes carry a consistent, predictable prefix across all machines.
*   **The Directory Namespace (`webbymk2`)**: This is the physical Git repository and root folder name on the host filesystem. The TUI completely separates the folder name (`webbymk2`) from the runtime identity (`unenter`), ensuring that if the folder is renamed or cloned into a worktree (e.g. `webbymk2-debug`), the Docker infrastructure continues to resolve under the canonical project slug `"unenter"`.
*   **Decoupled Host Registry Namespace**: All system configurations, known registries, and credential files are isolated using **Option A Namespace Architecture** (`%APPDATA%\unaxis\unenter\`). If a developer launches the TUI on a second project, the control plane automatically provisions a sibling namespace (e.g. `%APPDATA%\unaxis\other-project\`), keeping all environments isolated.

---

## 2. Core Runtime Topology ("Template of a Core")

The "Core Runtime" is the primary application stack that runs the platform. It is defined in the root [docker-compose.yml](file:///z:/WEBSITES/webbymk2/docker-compose.yml) and consists of 11 tightly coupled services connected via the `unenter` bridge network.

```
+-------------------------------------------------------------------------+
|                               unenter Network                           |
|                                                                         |
|  +------------+   +-------------+   +------------+   +---------------+  |
|  | unt_proxy  |==>|   unt_app   |==>|   unt_db   |<==|  unt_storage  |  |
|  |   (Proxy)  |   | (Next Zone) |   | (Postgres) |   | (Storage API) |  |
|  +------------+   +-------------+   +------------+   +---------------+  |
|         ||                 ||              ||               ||          |
|  +------------+   +-------------+   +------------+   +---------------+  |
|  |  unt_kong  |   | unt_realtime|   | unt_studio |   | unt_imgproxy  |  |
|  |  (Gateway) |   | (WebSockets)|   |  (Studio)  |   | (Image Proc)  |  |
|  +------------+   +-------------+   +------------+   +---------------+  |
+-------------------------------------------------------------------------+
```

### 2.1 Core Services Inventory
1.  **`unt_proxy` (Reverse Proxy)**:
    *   *Role:* Custom Node.js routing gateway (`proxy/server.js`) that hot-reloads domains in `~100ms` via `routes.json`.
    *   *Ports:* Public HTTP `:3080`, Admin API `:3081`, Embedded Agent API `:8888`.
2.  **`unt_app` (Next.js Mothership)**:
    *   *Role:* Primary domain router and canonical page boundary for `unenter.live`.
    *   *Port:* `:3000` (mapped to host).
3.  **`unt_kong` (API Gateway)**:
    *   *Role:* Supabase's HTTP proxy gateway. Translates internal service paths.
    *   *Port:* `:8001` (mapped to Kong port `8000`).
4.  **`unt_auth` (GoTrue API)**:
    *   *Role:* Decoupled user session, JWT generation, and OAuth validation.
5.  **`unt_rest` (PostgREST API)**:
    *   *Role:* Generates instantaneous RESTful endpoints directly from Postgres schemas.
6.  **`unt_realtime` (Phoenix WebSockets)**:
    *   *Role:* Listens to Postgres write-ahead logs (WAL) and broadcasts database mutations to subscribers.
    *   *Port:* `:4001` (mapped to `:4000`).
7.  **`unt_storage` (Supabase Storage API)**:
    *   *Role:* File and binary object storage, utilizing a local volume directory backup.
    *   *Port:* `:5000` (mapped to host).
8.  **`unt_imgproxy` (Image Transformation)**:
    *   *Role:* WebP optimization, resizing, and caching helper.
9.  **`unt_meta` (Postgres Management)**:
    *   *Role:* Translates database structure queries to JSON for the admin Studio dashboard.
10. **`unt_studio` (Admin Dashboard)**:
    *   *Role:* Supabase Studio UI. Accessible locally at `http://localhost:3002`.
    *   *Port:* `:3002` (mapped to `:3000`).

---

## 3. Database Subsystem Spec ("Template of a Database")

The database layer runs on **PostgreSQL 15** inside the `unt_db` container. It represents the ultimate single source of truth for the stack.

### 3.1 Host and Mount Specifications
*   **Host Port:** Mapped to `:5433` on the developer machine (Postgres standard `5432` internally).
*   **Persistent Storage Volume:** `unt-db-data` volume, bound to `/var/lib/postgresql/data` inside the container.
*   **SQL Schema Migrations:** Bootstrap schema and realtime configurations are loaded synchronously on startup from `supabase/realtime.sql` (bind-mounted read-only).

### 3.2 The Two-Track Backup System

To protect database integrity, UNAXIS implements two distinct backup mechanisms:

```
                            [ Backup Action ]
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         ▼                                                     ▼
[ CLI / Quick-Backup ]                               [ Snapshot Gallery ]
 - Command: unaxis db backup                          - Command: snapshotInstance()
 - Tool: pg_dump | gzip                               - Tool: pg_dump binary custom
 - Scope: SQL Dump Only                               - Scope: SQL + Schema + Env + Storage + Compose
 - Path: Volume Internal                              - Path: Host File System
   (/var/lib/postgresql/data/backups/)                 (backups/supabase-core/unenter/)
```

1.  **Fast Volume-Internal Backups (`[b]` key / `backupDatabase()`)**:
    *   *Format:* SQL plain-text, piped through `gzip` for compression.
    *   *Location:* `/var/lib/postgresql/data/backups/dump_*.sql.gz` inside the `unt_db` container (persisted on the host Docker volume).
    *   *Use Case:* Immediate disaster recovery checkpoints before applying local migrations or editing code.
2.  **Portable Host Snapshot Bundles (`[s]` key / `snapshotInstance()`)**:
    *   *Format:* PostgreSQL custom binary directory format (`pg_dump -Fc`).
    *   *Location:* Host filesystem at `PROJECT_DIR/backups/supabase-core/unenter/{timestamp}/`.
    *   *Contents:*
        *   `db.dump`: Binary compressed database backup.
        *   `schema.sql`: Human-readable schema reference.
        *   `storage/`: Complete binary copy of all Supabase storage files.
        *   `env.redacted`: Injected environment keys (secrets replaced).
        *   `compose.yml`: Hard snapshot copy of active `docker-compose.yml`.
        *   `metadata.json`: Full manifest detailing container names, ports, and sizes.
        *   `restore.sh`/`restore.ps1`: Automated, cross-platform recovery scripts.

---

## 4. Secrets & Token Cryptography ("Tokens")

All system security hinges on standard, cryptographically secure keys and environment tokens.

### 4.1 Token Inventory & Secure Storage

| Token Key | Format / Length | Purpose | Target Storage |
|:---|:---|:---|:---|
| `POSTGRES_PASSWORD` | Cryptographic string (32 chars) | Root PostgreSQL admin credentials | Local `.env` |
| `JWT_SECRET` | HS256 Secret (64 chars) | Cryptographic signature validation for GoTrue JWTs | Local `.env` |
| `ANON_KEY` | HS256 signed JWT | Public read-only client token | Local `.env` & Frontend |
| `SERVICE_ROLE_KEY` | HS256 signed JWT | Bypass Postgres RLS policies (super-user authorization) | Local `.env` & Backend |
| `remote_bridge_token` | Secure Token (64 chars) | Authentication key for remote node connection | `%APPDATA%\unaxis\unenter\.credentials.json` |

### 4.2 Credentials Pathing
Secrets must never be written to Git or standard configurations. The TUI manages a localized secure storage JSON file at `%APPDATA%\unaxis\.credentials.json` (created with strict `0o600` permissions on Unix hosts). 

---

## 5. Automation & Lifecycle Script Suites ("Automation Scripts")

UNAXIS packages five primary automation scripts to orchestrate system operations.

### 5.1 `bun run scripts/do-backup.ts`
*   **Purpose:** Executes the comprehensive 6-step snapshot pipeline directly from the shell.
*   **Execution Flow:**
    1.  Attaches to `unt_db` and executes `pg_dump -Fc` to write `db.dump`.
    2.  Executes schema-only dump to `schema.sql`.
    3.  Runs `docker cp unt_storage:/var/lib/storage/.` to sync all user assets locally to `storage/`.
    4.  Generates `env.redacted` stripping sensitive password/API keys.
    5.  Saves a hard copy of `docker-compose.yml`.
    6.  Compiles the `metadata.json` manifest and outputs the PowerShell and Bash restore files.
    7.  Renders a visual directory tree showing captured folder sizes.

### 5.2 `setup.ps1`
*   **Purpose:** Bootstraps the development environment on Windows.
*   **Execution Flow:**
    *   Validates Python, Git, and Bun installations.
    *   Generates a fresh local `config.json` with random port mappings if absent.
    *   Creates template `.env` and `.env.local` files, generating secure cryptographic secrets.

### 5.3 `run.ps1`
*   **Purpose:** Compiles and launches the interactive React/Ink Terminal UI (TUI) in the local shell.
*   **Flags:**
    *   `-Dev`: Starts in hot-reload mode, automatically rebuilding the bundle when source code files are modified.
    *   `-NoSplash`: Bypasses the initial splash animations, booting directly into the Welcome screen.

### 5.4 `build-and-push.ps1`
*   **Purpose:** Compiles Next.js dynamic zones into Docker containers and uploads them to the GitHub Container Registry (GHCR).
*   **Execution Flow:**
    *   Reads `zones/{key}/build.env` to inject required build-time environment arguments.
    *   Compiles the Docker container utilizing multi-stage cache layers.
    *   Tags the target image with `:latest`, `:YYYY-MM-DD-HHmm`, and the semver version tag.
    *   Pushes the target bundle to GHCR.

### 5.5 `smoke-test.ps1`
*   **Purpose:** Triggers a series of automated health checks to verify proxy and network health.
*   **Validation Steps:**
    *   Pings `/health` endpoints of local agents.
    *   Issues mock requests with custom `Host` headers to `:3080` to verify routing tables.
    *   Asserts container health states and queries database accessibility.

---

## 6. Environment Orchestration ("Explanations for Environments")

UNAXIS is designed to manage workloads across a distributed topology, splitting responsibilities between a local development environment and a remote production environment.

```
                    [ TUI Control Plane ]
                              │
         ┌────────────────────┴────────────────────┐
         ▼                                         ▼
   ( POWER Environment )                     ( L0V3 Environment )
   - Node Type: Local                        - Node Type: Remote
   - Agent: http://127.0.0.1:8888            - Agent: http://192.168.50.75:8888
   - Workload: Dev Zones & Supabase Core     - Workload: Public NPM Router & Mail
```

### 6.1 Node Responsibilities
1.  **POWER (Local Developer Environment - `192.168.50.204`)**:
    *   Runs the interactive TUI, Docker engine, core database stack (`unt_db`), API gateways, and active zone dev containers (e.g. `dev-blog`).
2.  **L0V3 (Remote Production Environment - `192.168.50.75`)**:
    *   Acts as the public gateway. Handles SSL termination (Nginx Proxy Manager) and provides external routing from public domains to the dev stack.
    *   Runs infrastructure supporting utilities (Mail, AI services, standalone agent containers).

### 6.2 Agent Pairing & Health Pings
*   **HTTP Health Pings:** The TUI continuously pings `/health` on all registered nodes. An agent is reported as offline if it fails to respond within `4s`.
*   **Self-Updating Operations (`/self-update`)**:
    When a new agent build is pushed, the TUI issues a signed payload to the target agent. The agent starts a detached helper container (`unaxis-updater`) which pulls the updated image, swaps the running container, verifies `/health` returns `v1.0.0`, and cleans up the deprecated rollback image—ensuring completely hands-free remote administration.

---

## 7. Zero-Keystroke Developer Onboarding & Seeding ("Overdefining the Initial Setup")

To make developer onboarding completely friction-free and robust, UNAXIS implements a **dual-layer self-healing seeding topology** for database environments. When a new developer downloads the repository and spins up the stack for the first time, they get a fully pre-populated, active local node (`POWER`) without manually configuring any SQL tables or terminal inputs.

```
       [ Clone Repository ]
                 │
                 ▼
       [ .\src\ink\setup.ps1 ]  ──► Provisions %APPDATA%\unaxis\unenter\config.json
                 │
                 ▼
       [ docker compose up -d ] ──► Launches Supabase Core + local DB (unt_db)
                 │
                 ▼
       [ .\src\ink\run.ps1 ]    ──► Launches Interactive React/Ink TUI
                 │
        ┌────────┴────────┐
        ▼                 ▼
 [ Static SQL Seed ]   [ Dynamic TUI Seeding ]
 - Migration inserts   - If DB loaded envs list is empty,
   fallback POWER node   TUI dynamically reads config.json
   record automatically. and inserts current host specs.
```

### 7.1 The Onboarding Protocol: Step-by-Step

#### Step 1: Local Credential Provisioning (`setup.ps1`)
The developer runs the first-time setup script from a PowerShell session:
```powershell
.\src\ink\setup.ps1
```
*   **What it does:**
    1. Validates prerequisites (Bun, Git, Docker, Node.js).
    2. Guides the user through a quick local input sequence (Domain, NPM coordinates, stack IPs).
    3. Creates a local configuration file isolated at `%APPDATA%\unaxis\unenter\config.json` (so credentials never leak into git).
    4. Generates a secure, cryptographically random `.env` and `.env.local` containing local PostgreSQL passwords and JWT secrets.

#### Step 2: Spinning up the Infrastructure
Once the configuration is created, the developer spins up the local Docker stack:
```powershell
docker compose up -d
```
*   **What it does:** Spins up all core components (`unt_db`, `unt_kong`, `unt_auth`, `unt_rest`, `unt_proxy`, etc.).
*   **SQL Migration Application:** The `unt_db` container automatically applies all SQL migrations in chronological order, including `supabase/migrations/20260517_unaxis_environments.sql`.

#### Step 3: Launching the Control Plane (TUI)
The developer launches the TUI via the launcher:
```powershell
.\src\ink\run.ps1 -Dev
```
*   **What it does:** Runs `src/main.tsx` under watcher mode. The root guard validates local path structures, boots the splash shimmer, and mounts the primary Ink App.

---

### 7.2 The Dual-Layer Environment Seeding Mechanics

If the database is clean (no environment records exist), the system populates the local environment record using two layers:

#### Layer 1: Static Migration Seeding
Inside `supabase/migrations/20260517_unaxis_environments.sql`, an active INSERT query is executed when the table is created:
```sql
INSERT INTO public.environments (
  id, name, type, status, active, is_default_target,
  docker_url, machine_role, agent_url, agent_port, agent_status,
  npm_host, npm_port, proxy_host, proxy_port, domain, public_url
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
```
*   **Purpose:** Ensures that even without TUI intervention, a baseline, correctly-formatted record exists in PostgreSQL representing the local dev host.

#### Layer 2: Dynamic TUI Self-Healing
If the static seed was omitted, or if the tables were manually wiped by a database command, the TUI dynamically self-heals.
When `loadEnvironments()` in `environment-store.ts` runs, if it receives an empty array (`[]`) from Supabase:
1.  **Reads Local Filesystem:** It dynamically imports `fs` and parses `%APPDATA%\unaxis\unenter\config.json`.
2.  **Resolves Current Host IPs:** It extracts the active domain, stack IP, proxy ports, and ASUS DDNS hostname.
3.  **Inserts Record dynamically:** It performs a POST request back to PostgREST to create the `POWER` environment record on the fly with the exact coordinates of the developer's local machine.
4.  **Auto-Refreshes:** It reloads the environment list, resulting in a zero-keystroke onboarding experience.

---

### 7.3 Detailed Database Schema Reference

The `public.environments` table structure contains the following critical fields required for orchestrating zones:

| Column | Data Type | Default | Description |
|:---|:---|:---|:---|
| `id` | `uuid` | `gen_random_uuid()` | Primary key identifying the environment. |
| `name` | `text` | *None* | Unique name of the host (e.g. `POWER`, `L0V3`). |
| `type` | `environment_type` | `'local-docker'` | Enum: `local-docker`, `remote-docker`, `azure`, `edge`. |
| `status` | `environment_status` | `'unknown'` | Enum: `up`, `down`, `unknown` (host status). |
| `active` | `boolean` | `false` | Deprecated active environment target flag. |
| `is_default_target` | `boolean` | `false` | Wizard pre-selected deploy target. |
| `docker_url` | `text` | `''` | Direct Docker engine TCP/socket URL. |
| `machine_role` | `text` | `''` | Visual label describing the host machine role. |
| `agent_url` | `text` | `''` | Endpoint for the running unaxis agent. |
| `agent_port` | `integer` | `8888` | Local port of the unaxis agent. |
| `agent_status` | `text` | `'unknown'` | Current agent state: `online`, `offline`, `unknown`. |
| `npm_host` | `text` | `''` | Nginx Proxy Manager admin dashboard host IP. |
| `npm_port` | `integer` | `81` | Nginx Proxy Manager admin dashboard port. |
| `proxy_host` | `text` | `''` | Routing proxy host IP. |
| `proxy_port` | `integer` | `3080` | Mapped HTTP proxy port on the host machine. |
| `domain` | `text` | `''` | Root domain name linked to this environment node. |
| `public_url` | `text` | `''` | Fully-qualified public domain URL. |

