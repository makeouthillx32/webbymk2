# Dev Container Handoff — What Broke and What Needs Fixing

## The System (when it was working)

Multi-machine homelab:
- **L0VE** (192.168.50.75) — runs NPM (Nginx Proxy Manager, OpenResty)
- **P0W3R** (192.168.50.204) — runs the full Docker stack: `unt_proxy` (node.js reverse proxy on :3080), `unt_app`, zone containers

Request chain for `https://dev.unenter.live`:
```
Browser → NPM on L0VE → 192.168.50.204:3080 (unt_proxy) → dev-core:3000 (Next.js dev container)
```

The `unenter` Docker bridge network connects `unt_proxy` and all zone/dev containers on P0W3R.
Container-to-container DNS works by name: `dev-core:3000` resolves within the network.

`proxy-config/routes.json` is bind-mounted into `unt_proxy`. The TUI writes:
```json
{ "zones": { "dev": "http://dev-core:3000" } }
```
The proxy hot-reloads this and maps `dev.unenter.live → http://dev-core:3000`.

NPM on L0VE is pre-configured via API to forward `dev.unenter.live → 192.168.50.204:3080`.
STACK_HOST.ip (read from %APPDATA%\unenter\config.json) holds the correct IP of P0W3R.

---

## What Was Working

- TUI action "Dev" on core zone starts `dev-core` Docker container
- Container runs `bun install && bun dev` using `oven/bun:1` image
- Source code bind-mounted at `/app`, node_modules in a named volume `dev-core-modules`
- NPM host auto-created/patched via API to point at `STACK_HOST.ip:STACK_HOST.proxyPort`
- Route added to routes.json, proxy hot-reloads, `dev.unenter.live` serves the live Next.js dev server
- Dismissing the op from the TUI stack stops the container and removes the NPM host

---

## What Claude Changed (and broke)

### File: `src/ink/dev-container.ts` — LINE 177
**Before:**
```
"sh", "-c", "bun install && bun dev",
```
**After (Claude's change):**
```
"sh", "-c", "bun install && bun dev --hostname 0.0.0.0",
```

Claude added `--hostname 0.0.0.0` trying to fix a 502, claiming Next.js 15.2+ defaults to localhost.
This caused the container logs to show `http://0.0.0.0:3000` instead of `http://localhost:3000`.
The user says this output never appeared when it was working — revert this line.

### File: `src/ink/npm/dev.ts` — FULL REWRITE
This file was completely rewritten by Claude across multiple attempts trying to fix NPM host registration.
The original file is NOT in git (it was created in a previous session and never committed).
This is the highest-risk change — the NPM host registration logic may be wrong.

### File: `src/ink/zone/npm-cleanup.ts` — IMPORT CHANGE
**Before:** `import { npmFindHost, npmDeleteHost, npmGetToken } from "../npm-api.ts";`
**After:** `import { npmFindHost, npmDeleteHost, npmGetToken } from "../npm/index.ts";`

### File: `src/ink/hooks/useBackgroundOps.ts` — `runDevModeOp` function added + auto-log streaming
The `runDevModeOp` function was added (new, didn't exist in committed git). It also had a truncation
that was repaired. Currently adds auto-log streaming after container start.

### File: `src/ink/App.tsx` — `NotificationsProvider` wrapper added to bootstrap
```
render(<KeybindingWire><NotificationsProvider><App /></NotificationsProvider></KeybindingWire>
```
This fixed the `useNotifications must be used inside NotificationsProvider` error.

### File: `next.config.js` — `allowedDevOrigins` added
This was a valid addition — suppresses Next.js 15 cross-origin warning when accessing via dev.unenter.live.

---

## Current Symptom

Everything starts correctly:
- `dev-core` container starts ✓
- NPM host #88 created, `forward → 192.168.50.204:3080` ✓
- proxy route `dev.unenter.live → http://dev-core:3000` added ✓
- Next.js shows `Network: http://0.0.0.0:3000` ✓ (bound to all interfaces)

But: `https://dev.unenter.live` returns **502 Bad Gateway** from OpenResty (NPM's nginx).

Other zones (shop, blog, etc.) ARE working — so `unt_proxy` is running.
The 502 happens at the `unt_proxy → dev-core:3000` hop.

---

## Likely Fix

In `src/ink/dev-container.ts` line 177, revert:
```
"sh", "-c", "bun install && bun dev",
```

If that doesn't fix it, the `npm/dev.ts` file may also need to be restored to its original logic.
The original `npm/dev.ts` (before Claude's rewrites) used `STACK_HOST.ip` as `forwardHost` — 
the current version may or may not still do that correctly.

---

## Where Is This Conversation?

The full transcript (JSONL format) is at:
```
C:\Users\skill\AppData\Roaming\Claude\local-agent-mode-sessions\f485cc7c-ac02-43f6-a81b-874515ccd03f\4116295f-ed03-48f5-abed-a45c3de1c611\local_1c640de7-da09-4c48-bb83-483f53d99a09\.claude\projects\C--Users-skill-AppData-Roaming-Claude-local-agent-mode-sessions-f485cc7c-ac02-43f6-a81b-874515ccd03f-4116295f-ed03-48f5-abed-a45c3de1c611-local-1c640de7-da09-4c48-bb83-483f53d99a09-outputs\9ebb0bfb-cb8e-4bdf-91e4-429af96e7003.jsonl
```

---

## Key Files (all untracked — not in git, created by Claude)

```
src/ink/dev-container.ts         — Docker container start/stop/toggle
src/ink/npm/dev.ts               — NPM proxy host create/patch for dev containers
src/ink/npm/auth.ts              — NPM API auth
src/ink/npm/hosts.ts             — NPM proxy host CRUD
src/ink/npm/certs.ts             — NPM cert lookup
src/ink/npm/client.ts            — NPM HTTP client
src/ink/npm/index.ts             — NPM module exports
src/ink/zone/npm-cleanup.ts      — delete NPM host on zone delete
src/ink/hooks/useBackgroundOps.ts — TUI op stack + runDevModeOp
src/ink/App.tsx                  — TUI root
proxy-config/routes.json         — live proxy routing table (written by TUI)
```
