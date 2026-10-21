# Project Mandate: Local Infrastructure Control Plane

This document defines the canonical architectural language and naming conventions for the `webbymk2` platform. It serves as an evolving architectural field journal, grounded in observable runtime behavior.

> **Repo layout (since 2026-10-19):** this repo is **unenter.live** — the Next.js site, its zones, the proxy and the Supabase/infra config. **UNAXIS** (the TUI/CLI control plane and its `src/ink` engine) is its own private repo at `Z:\UNAXIS\unaxis`; section 3.1 describes code that lives there. If you are here to work on the site, read section 5 first.

## 1. The Core Model

The platform is divided into three logical planes:

- **Control Plane**: The TUI, CLI, and orchestration brain. It handles user actions, resource discovery, operation pipelines, and **distributed node management**. It acts as a single pane of glass for the entire topology.
- **Data Plane**: The actual running workloads and infrastructure (containers, Supabase stack, gateway, zones, volumes, and networks) spread across one or more nodes.
- **Constraint Plane**: The system of rules and measurements (e.g., `stringWidth`, `useWidths`) that enforce visual integrity and layout stability in a terminal environment.

## 2. The Architectural Lexicon

| Category | Term | Definition |
| :--- | :--- | :--- |
| **Topology** | **Node** | A physical or virtual host machine (e.g., `L0VE`, `P0W3R`) running a portion of the Data Plane. |
| **Topology** | **Distributed Workload** | A service or stack that spans multiple nodes or is managed across node boundaries (e.g., a Zone routed via a Gateway on a different machine). |
| **Workload** | **Zone** | A frontend/runtime application boundary (e.g., Next.js Multi-Zone). |
| **Workload** | **Instance** | A stateful backend runtime (e.g., an independent Supabase database). |
| **Workload** | **Shadow Wrapper** | A thin deployment folder (`zones/{key}/`) that re-exports content from a Core Integrated Module. |
| **Workload** | **Core Module** | The primary content and logic home (`src/zones/{key}/`) where developers edit code with full core visibility. |
| **Infra** | **Gateway** | The routing and proxy layer (Nginx Proxy Manager). *Avoid using "NPM" to prevent collision with Node Package Manager.* |
| **Infra** | **Stack** | A grouped set of connected services, usually Docker/Compose-backed. |
| **Infra** | **Service** | An individual running workload or container. |
| **Execution** | **Pipeline** | An ordered operation flow (e.g., Scaffold → Build → Deploy). |
| **Execution** | **Operation** | A single user-triggered command or background task. |
| **Inheritance** | **Selective Inheritance** | The build-time process (via Dockerfile) of pulling specific Core directories based on a Zone's Layout Type. |
| **State** | **Source-as-State** | The pattern of persisting runtime behavior by patching source code files (e.g., `zone-overrides.ts`). |
| **Recovery** | **Heal** | Automated repair or reconciliation of a degraded state. |
| **Data Safety** | **Snapshot** | A point-in-time state capture of a volume or database. |
| **Data Safety** | **Restore** | The recovery of an environment or database from a snapshot. |
| **Media Plane** | **Archive** | The historical 24-hour continuous recorded film/length of footage for a room per day. |
| **Media Plane** | **2-Minute Clips (Magic Trick Loop)** | Short ~2-minute pre-recorded video clips played in room feeds to maintain the illusion of an active camera when offline/standby. Strictly distinct from Archive. |
| **Rendering** | **Constraint** | A rule-based width or height limit enforced to prevent visual shatter and maintain column ownership. |

## 3. Naming Conventions

### 3.1 UI Components (UNAXIS repo, `src/ink/`)
- **`*Screen.tsx`**: Immersive, full-terminal takeovers (e.g., `WelcomeScreen`, `WizardScreen`).
- **`*View.tsx`**: Top-level content areas rendered inside the main layout, usually tied to a Tab.
- **`*Panel.tsx`**: Reusable contextual windows or sub-sections rendered inside a View.
- **`use*Manager.ts`**: Hooks that encapsulate polling and orchestration logic for a specific domain (e.g., `useZoneManager`).

### 3.2 Orchestration Logic
- **`*Engine.ts`**: Low-level execution systems that talk directly to the OS or Docker (e.g., `DockerEngine`).
- **`*Client.ts`**: API-facing wrappers for external services (e.g., `GatewayClient`).
- **`*Orchestrator.ts`**: Modules that coordinate complex steps across multiple systems.

## 4. Operational Mandates

- **Transactional Scaffolding**: Never leave "ghost" files or DB rows. If an **Atomic Phase** pipeline step fails, the orchestrator must attempt to roll back or clean up artifacts. **Maintenance Phase** failures (e.g., cert issuance) are non-fatal.
- **Async Streaming**: All long-running operations must provide a `(onLine: OnLine) => void` callback to stream live logs to the Control Plane.
- **One Core Truth**: The platform prioritizes the health and integrity of the **Core Runtime** and the **Shared Source Code**. Zones are child workloads that must adhere to core layout contracts.

## 5. Working in this repo (coding agents)

**Where things are**
- `src/app/` — the core site (unenter.live) and its API routes; `src/app/dashboard/` — the admin dashboard.
- `src/zones/<key>/` — each zone's real code (Core Module); `zones/<key>/` — its thin Shadow Wrapper (re-exports only).
- `src/components/`, `src/lib/`, `src/hooks/` — shared code. **Anything shared ships in every zone's image**, so keep changes small and deliberate.
- Supabase types: `types/supabase.ts`.

**Check your work**
- `bun run typecheck` (`tsc --noEmit`). The repo already has ~280 type errors (as of 2026-10-21); never add new ones — compare the errors in the files you touched before and after.
- `bun run lint` where relevant.
- Don't start dev servers or builds yourself; say what you changed and how to see it.

**Never touch** (hand these to the human instead)
- `docker-compose.yml`, `proxy/`, `supabase/` (e.g. `kong.yml`), `coturn/`, `mediamtx/`, `syslog/`, `proxy-config/` — live production config.
- `.env*`, keys, tokens — never read them into output or commit them.
- `vault/` (notes, not code) and `unaxis.json`.
- Database migrations against production, and `unaxis`/`docker` commands that build, deploy or restart anything.

**Git**
- Work on a branch; `main` is protected on the forge (`origin`). Small commits, conventional messages: `feat(zone): …`, `fix(dashboard): …`.
- Keep line endings as they are (this repo mixes CRLF/LF; config files must stay LF).
