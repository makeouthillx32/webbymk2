# CLAUDE.md — webbymk2 / unenter.live

Monorepo for **unenter.live**: a Next.js 15 app, the **UNAXIS** TUI control plane, a multi-zone reverse proxy, and Docker infrastructure agents. Also doubles as an Obsidian vault (`vault/` — see `_CLAUDE.md`).

## Repo map

- `src/` — Next.js app source (`@/*` maps to `src/*` in tsconfig, `./*` in jsconfig)
- `src/ink/` — UNAXIS TUI + local Ink engine (own package `@untsystems/unaxis`, see `src/ink/CLAUDE.md`)
- `src/zones/` — per-zone site sources (blog, shop, docs, etc.)
- `packages/agent/` — UNAXIS infrastructure agent, HTTP proxy to Docker socket (see `packages/agent/CLAUDE.md`)
- `packages/agent-node/`, `packages/agent-updater/` — Dockerfile + shell script deployables (no package.json)
- `proxy/` — multi-zone reverse proxy for unenter.live (see `proxy/CLAUDE.md`)
- `docker-compose.yml` — full stack: app, Supabase services (db, kong, auth, rest, realtime, storage, studio…), proxy
- `docs/` — core-db, db-instances, dev-log
- `vault/` — Obsidian notes; gitignored, never commit; rules live in `_CLAUDE.md`

## Commands

Runtime is **Bun** for tooling/TUI, Next.js for the web app. Dev machine is Windows — use PowerShell syntax for host commands.

- `bun run dev` — Next.js dev server (clears `.next` first)
- `bun run build` / `bun run start` — production build/serve
- `bun run lint` / `bun run typecheck` — lint and `tsc --noEmit`
- `bun run db:types` — regenerate `types/supabase.ts` from local Supabase
- `bun run tui:dev` — TUI dev mode (`src/ink/run.ps1 -Dev`)
- `bun run tui:run` — build then start the TUI (`tui:build` + `tui:start`)
- UNAXIS CLI: `unaxis <env-slug> <cmd>` (e.g. `unaxis unenter <cmd>` to inspect the live node)

## Environment model

- Hosts (UNAXIS environments): **POWER** (`192.168.50.204` — dev workspace, TUI, core stack + DB, self-hosted Forgejo, Infisical, media origin), **L0V3** (`192.168.50.75` — docs/blog/shop zones, restic backup target), **OPT1** (Linux — Nginx Proxy Manager / ingress, SRT camera receiver, media edge). POWER and L0V3 are Windows + Docker Desktop.
- Code: `origin` is the self-hosted **Forgejo** (source of truth); it push-mirrors only `main` and listed branches to GitHub. `main` is protected — changes from others arrive as pull requests.
- Secrets: self-hosted **Infisical** (`unaxis secrets`); builds read `.env` and only shadow-compare until `secrets use-for-builds on`. Backups: `unaxis backup` (restic, nightly 03:30). Details: `vault/Architecture/Self-hosted forge (Forgejo).md`.
- UNAXIS's live local config is `%APPDATA%\unaxis\unenter\config.json` (not the repo-root `config.json`); NPM's address follows the topology's `ingress` placement.
- Compose project namespace is `unenter` (`-p unenter`). Key ports: TUI IPC `50505` (prod) / `50507` (dev), Postgres `5433`, Next dev `3000`, proxy `3080`.
- Volatile runtime state (versions, active stacks) lives in `vault/CRITICAL_FACTS.md` — verify via CLI before acting, don't trust cached notes.
- All environments are live nodes; `is_default_target` selects the default target (no "active" env concept).
- Agents on nodes are updated via the UNAXIS push-agent/self-update flow — don't hand-edit remote containers.
- Prefer `unaxis` commands over raw `docker` / `docker compose` for zone, build, deploy, and log operations.
- UNAXIS control DB: SQLite at `%APPDATA%\unaxis\control.db`; run `unaxis db migrate-control` on fresh installs.

## Build & deploy rules (hard-won)

- `unaxis <env> zone <key> build` is the **complete ship pipeline** — build, push, pull, force-recreate, proxy reload. Do NOT run `deploy` after a successful `build`.
- Production ships from Forgejo: `zone <key> build --ref main` (TUI **B**) builds that exact commit from a clean checkout (tag `g<sha>`). Plain `build` (TUI **b**) builds the dev drive as-is and records the tree on Forgejo under `refs/unaxis/builds/`.
- Dev mode (`zone <key> dev start`) is bare metal for every zone (`scripts/dev-bare.ts`, ~5 s hot reload); `--container` is the old Docker path. Saving anything under `src/ink` restarts the dev TUI and cancels its running builds.
- **Build ONE zone at a time.** Parallel builds OOM the Docker daemon (queue busy-check reads stale IPC state). Fire one, poll `unaxis stacks`, then the next.
- Build hangs at "Generating static pages (0/N)" = SSG fork-ENOMEM, not network. Fix is `experimental: { cpus: 2 }` in `next.config.js`; diagnose with `unaxis build-doctor` / `build-mem`; unstick zombie builders with `unaxis builder-reset`.
- Changes under shared `src/` compile into **every** zone image — rebuild each public zone that must receive them. Changes under `zones/<key>/` affect only that zone.
- Verify deploys in a real browser with a cache-buster query string; check the pushed `g<sha>[-dirty]` tag, never infer success from the page body alone.

## CRLF hazard (recurring bug class)

CRLF line endings on Docker/config files silently break pattern matching on this Windows host. Known casualties: `kong.yml` (killed all auth) and `.dockerignore` (patterns became `node_modules\r`, shipped a 1.7 GB build context). If a config file mysteriously "does nothing", check line endings first — fix with `dos2unix` on the host or `.gitattributes` (`* text eol=lf` for the file).

## Skills — use them

- **unaxis-operator** — required for any zone/build/deploy/log/diagnostic work.
- **cli-framework-oclif-ink** — required for any TUI / Ink engine / CLI command work.
- **obsidian-second-brain** — for vault reads/writes; follow `_CLAUDE.md` writing rules.

## Conventions

- TypeScript, ESM (`"type": "module"` in subpackages). React 18.3.1 in the TUI (pinned — the local engine's reconciler depends on it).
- Docker images are tagged `g<sha>[-dirty]`, not by UNAXIS version.
- Build failures with silent EOF during `next build` usually mean memory starvation — stop idle DB instances before rebuilding.
- Documentation notes go in `vault/`, never in `src/`. Daily logs: `vault/Logs/YYYY-MM-DD.md` (append-only).

## Related agent files

- `_CLAUDE.md` — Obsidian vault operating manual (MCP connection, folders, frontmatter, writing rules). Read it before any vault work.
- `_ANTIGRAVITY.md` / `vault/_CODEX.md` — overlays for other agents; not for Claude.
