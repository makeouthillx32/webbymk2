---
tags: [unaxis, agent, architecture, dev-log]
date: 2026-07-08
---

# Self-report model: agent v1.1.0

## Decision
Environments report their own state instead of the TUI inferring from outside.
The agent sits on the node → it is the authority on that node.

## Shipped (agent v1.1.0, proxy/agent.js — one file, both contexts)
- `GET /health` now includes `engine: {state: up|wedged|off|error, latencyMs, error}` + host snapshot (RAM/CPU/load/uptime)
- `GET /db/status` — Supabase stacks self-report (fingerprint: compose project with db+kong services), per-service state+health
- `GET /zones/status` — unt_* zone containers, state/health/image/uptime
- `GET /proxy/status` — proxy/NPM containers (container-level; cert expiry + routes = v2, needs NPM API creds)
- Error path: if the engine is down, status endpoints return 503 WITH the engine tile in-band

## TUI side
- `src/ink/env-probe.ts` — layered probe: TCP → /health → engine; states online/busy/wedged/engine-off(sleeping)/restarting/agent-down/offline
- `unaxis env health [--json]` CLI command
- Env panel: state tile per card + host/agent/engine tile row, 15s auto-poll
- Agents ≥1.1.0: self-report is authoritative; older agents: external /docker/_ping fallback → rolling update safe

## Auto-heal (designed, NOT built — guardrails first)
- wedged → notify + suggest builder-reset / engine restart; never auto-restart the engine without opt-in
- engine-off during a scheduled window (gaming) is EXPECTED — suppress alerts, show ⏾ sleeping
- Opt-in per environment flag later: `heal_policy: manual | assisted | auto`

## Pending to test (Docker + TUIs were off — gaming)
1. Start dev TUI → `unaxis env health` (POWER should read ⏾ sleeping)
2. Start Docker → embedded agent hot-reloads to 1.1.0
3. TUI `env update L0V3` → build+push image → /self-update → verify 1.1.0 remote
4. Ship queued docs zone redesign (md-driven docs + services + tyler pages)

## Ops lessons today
- Wedged buildkit container = engine inspect hangs → builds fail at builder init; builder-reset can't fix a wedged engine; Docker Desktop restart required
- Stopping heavy idle stacks (essdb, testubg) is safe: UNAXIS db instance stop, volumes persist



## Outcome (same day, after POWER restart)
- ✅ `env health`: POWER + L0V3 both online, both **(agent-reported)** — v1.1.0 live on both nodes
- ✅ L0V3 updated via TUI: `proxy push-agent --bg` → `env update L0V3` → version verified 1.1.0
- ✅ Docs zone shipped: docs.unenter.live live with md-driven landing + /unenter /services /tyler + /operator
- 🔧 Root cause of "IPC refused while TUI renders": **Hyper-V excluded port ranges shift on Docker restart and swallowed 50505/50507; listen error was silently swallowed.** Fixed: ipc-server now loudly reports bind failures + fix hint. Ports permanently reserved via `netsh int ipv4 add excludedportrange`.
- 🔧 `.dockerignore` excluded `proxy/` which silently broke agent image builds ("/proxy/agent.js not found") — fixed with `!proxy/agent.js` negation.

## Next big update candidates (from this flow)
1. **Vault (snapshot off-host push)** — still the top gap: 1 snapshot copy on Z:\ only
2. TUI consumption of `/db/status` `/zones/status` `/proxy/status` (db-api remote support)
3. Assisted healing (`heal_policy`) on top of probe states



## RESOLVED: the "L0V3 phantom v0.1.8" (2026-07-11)
Not a phantom, not a boot script, not a second engine. **The updater was rolling back every update.**

Root cause chain:
1. `/health` gained TOFU signature auth (somewhere after agent 0.1.x)
2. `updater.sh` health-gates the swap with an **unsigned wget** to the new container's bridge IP → 401 → wget "fails" → 20/20 tries fail → rollback
3. `updateRemoteAgent` polls only ~seconds — declares "✓ version X" **before** the 100s gate ends → every success message was true-then-reverted
4. The resurrected container was the ORIGINAL May-23 deployment (0.1.8) — its startup line in the shared log was the giveaway (`packages/agent-node/agent.js` LOG_SRC + `version=0.1.8` at 12:35, 100s after the swap)

Fixes (agent v1.1.1 + updater):
- agent.js: unsigned GET /health allowed from **loopback only** (fixes Docker HEALTHCHECK 401 → perpetual "unhealthy")
- updater.sh: health probe now `docker exec <new> wget 127.0.0.1/health` (loopback exemption applies); bridge-IP fallback treats HTTP 401 (wget rc=8) as ALIVE — a 401 proves the agent is up and enforcing auth
- Verified: v1.1.1 survived >3 min post-update, rollback slot self-cleaned, container runs from `:v0` tag

Follow-up for release: `updateRemoteAgent` should verify AFTER the updater's gate window (poll ~2.5 min or watch for the rollback rename) so success messages can't lie again.



## Added: `unaxis stack clear` (2026-07-13)
Failed bg ops linger by design (for inspection) but a stale one clutters the stack. Added an
IPC/CLI command to clear finished ops without the interactive TUI [x]/DismissAll keys:
- `unaxis stack clear` — remove all FINISHED ops (done + failed)
- `unaxis stack clear <id>` — one op by id
- `unaxis stack clear --failed` — failures only
Running/live (dev/log-tail) ops are never yanked.

Impl: threaded setBgOps + triggerDismissHook from App → useIpcBridge (stable refs); the `stack`
handler branches on args[0]==="clear", filters ops (!busy && !isLog), fires dismiss hooks, and
setBgOps to drop them. Registered in cli-schema. Operator skill (.skill) repackaged with the
command + a "clear a stale failed op over IPC" note. Verified: compiles + hot-reloads, correct
empty-case behavior; the motivating stale "Build App ✗" op is gone (TUI restart also resets state).
