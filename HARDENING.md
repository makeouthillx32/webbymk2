# HARDENING — UNAXIS Forward Plan
> What comes next: actionable improvements, reliability targets, and the vision.  
> Last updated: 2026-05-24

---

## Context

This document covers work that should happen after the current stable baseline.
The baseline (as of this session) is:

- Zone scaffold pipeline is hardened with a pre-build validator (`validate.ts`)
- Dynamic zones route correctly without manual `multiZone.ts` edits
- `proxy/agent.js` is the unified single source of truth for both POWER and L0V3
- Agent updater has health-check + rollback built in
- TOFU ECDSA pairing protects the agent API
- `UNAXIS.md` documents the full architecture

Everything below is additive — none of it breaks the current stack.

---

## Immediate Cleanup (Do This First)

These are loose ends from this session that should be resolved before the next
feature push.

### 1. Delete Tombstoned Agent Files

The old standalone agent code was unified into `proxy/agent.js`.
Two files are now dead weight in the repo:

```powershell
Remove-Item Z:\WEBSITES\webbymk2\packages\agent-node\agent.js
Remove-Item -Recurse Z:\WEBSITES\webbymk2\packages\agent-node\handler
```

Leaving them creates confusion — a future reader will see two agent
implementations and not know which one is canonical. The UNAXIS.md answer is
`proxy/agent.js`. Remove the old artifacts.

### 2. Rebuild the `logs` Zone

The `logs` container is running an image built before the `getZoneConfig` fix.
It works (routes correctly, no redirects) but the `x-unenter-zone` response
header is inaccurate — it resolves to `"unenter"` instead of `"logs"`.

From the TUI: highlight `logs` → `↵` → build → deploy.
No NPM recert needed. The zone is already registered and routing correctly.

### 3. Confirm L0V3 Agent is on v1.0.0

L0V3 was at v0.1.8 before agent unification. If it hasn't been updated yet:
TUI → `home › env` → highlight L0V3 → `[p]` to check version → `[u]` to update.

---

## Zone Pipeline Hardening

### 4. Extend the Scaffold Validator

`validate.ts` currently catches 5 rules. Add these:

| Rule | What to check | Why |
|------|--------------|-----|
| `public-dir` | `COPY public/ ./public/` present in Dockerfile | Missing public dir = 404 on all static assets |
| `build-arg-declared` | Each `NEXT_PUBLIC_*` in `build.env` has a matching `ARG` in Dockerfile | Build-time vars silently become empty string if not declared |
| `compose-network` | Compose file declares the correct Docker network | Zone container can't reach `unt_db` or other services if network is missing |
| `port-unique` | dev port in `package.json` is not already used by another zone | Port collision silently kills one zone's dev container |

Implementation: add `checkDockerfilePublicDir()`, `checkBuildArgs()`,
`checkComposeNetwork()`, and `checkDevPortCollision(z, allZones)` in `validate.ts`.
Call them from `validateScaffoldOutput()`.

### 5. Zone Rebuild Detection

When `middleware.ts` or `src/lib/multiZone.ts` changes, all zone images are
stale — they baked the old code at build time.

The TUI should track a "zone middleware fingerprint": a hash of
`middleware.ts` + `multiZone.ts` stored alongside each zone's last-built
timestamp in Supabase. When the fingerprint changes, mark affected zones with
a `⚠ stale middleware` badge in the zones panel.

This makes the "rebuild all zones after a shared-file change" step visible
instead of invisible. Right now there is no signal — you have to remember.

Schema addition to `zones` table:

```sql
ALTER TABLE zones ADD COLUMN middleware_hash text;
ALTER TABLE zones ADD COLUMN last_built_at   timestamptz;
```

TUI: after any proxy/middleware file write, recompute the hash and compare
against each zone's stored value.

### 6. Smoke Test Runner

`SMOKE-TEST.md` describes 6 manual tests. These should be runnable with a
single TUI keypress instead of a browser checklist.

Build a `smoke-test.ts` module that:
1. Makes HTTP requests to each zone's public URL via `http://192.168.50.204:3080`
   with the correct `Host` header (no NPM/internet required)
2. Checks the `x-unenter-zone` response header matches the expected zone key
3. Checks status code is 200 (not 301/302/500)
4. Reports pass/fail per zone in a TUI operation log

Wire it to `[t]` in the proxy action panel, or as a standalone TUI command.
Target: zero-keystroke confidence after any proxy or middleware change.

---

## Agent & Infrastructure Hardening

### 7. Auto-Update L0V3 After Agent Push

Current flow:
1. TUI `home › core` → Proxy → `[a]` Push agent (builds + pushes to GHCR)
2. TUI `home › env` → L0V3 → `[u]` Update agent (triggers `/self-update`)

Step 2 is always the right follow-up to step 1, but it's manual.
Add a prompt after `[a]` Push completes: `"Push complete. Update L0V3 now? [y/N]"`.
If confirmed, automatically call `/self-update` on the L0V3 agent.

This prevents the split-brain state where POWER runs v1.0.1 and L0V3 is still
on v1.0.0 — which defeats the point of having a unified agent.

### 8. Rollback TUI Action

Every zone build produces a `:YYYY-MM-DD-HHmm` immutable tag in GHCR.
There is currently no TUI action to use these tags.

Add `[z]` Rollback to the zone action panel:
1. Fetch tags for the zone's image from GHCR API (list last 5)
2. Display them in a selection list with timestamps
3. On select: update the compose artifact's `image:` field to the chosen tag
4. Run deploy (pull + force-recreate)
5. Health wait

This turns the immutable tag strategy into a real operational tool instead of
a safety net you can't reach.

### 9. Agent Endpoint: Zone Status

Add `GET /zones/status` to `proxy/agent.js`:

```json
{
  "zones": [
    { "name": "unt_logs", "status": "running", "health": "healthy", "uptime": 3600 },
    { "name": "unt_app",  "status": "running", "health": "healthy", "uptime": 86400 }
  ]
}
```

This aggregates `docker inspect` data for all `unt_*` containers.
The TUI already has the zone list from Supabase — combine with live Docker
state from this endpoint for a richer zones panel (real health + uptime badges,
not just "container exists or not").

---

## Security Hardening

### 10. Credential Rotation Workflow

The TOFU ECDSA keypair is generated once at first-pair time and never rotated.
Add a planned rotation workflow:

1. TUI `[k]` Reset pairing generates a fresh keypair
2. Before clearing the old state, the TUI warns: "This will break all active
   sessions. Confirm? [y/N]"
3. After reset, immediately trigger `/health` ping to confirm the new handshake
   is accepted

Document the rotation interval recommendation in `HARDENING.md` (this file):
rotate quarterly or after any machine is decommissioned.

### 11. Agent API Rate Limiting

`proxy/agent.js` currently has no rate limiting on its endpoints.
The `/docker/*` passthrough is especially sensitive — full Docker API access.

Add a simple token-bucket rate limiter (no dependency needed — pure Node):
- `/health` — 60 req/min (TUI polls every few seconds)
- `/docker/*` — 30 req/min
- `/stacks/deploy` — 5 req/min (heavy operation; shouldn't burst)
- `/self-update` — 2 req/min

Log rate limit hits with a timestamp so they're visible in `[l]` Logs.

### 12. Secrets Out of routes.json

`proxy-config/routes.json` currently stores only routing data (no secrets).
Keep it that way. Add a lint step to the TUI's `[s]` Sync Routes action that
scans `routes.json` for keys matching `*KEY*`, `*SECRET*`, `*TOKEN*`, `*PASS*`
and warns loudly if found.

If environment config ever needs to be stored near the routing config, use
a separate `proxy-config/secrets.json` with a `.gitignore` entry — never mix
secrets into the routing file.

---

## Observability

### 13. Centralised Zone Logs

Every zone's logs are accessible via `[l]` in the zone action panel, but
viewing multiple zones at once requires switching between them.

Add `logs.unenter.live` as a real log aggregation zone (it already exists as a
container). Feed it structured log lines from all `unt_*` containers via a
lightweight Docker log driver or poll loop. Display with zone badges and
severity colouring.

Minimum viable: a Node process inside `unt_logs` that tails
`/var/run/docker.sock` events and streams them to a web UI.

### 14. NPM Certificate Expiry Monitoring

Let's Encrypt certs expire every 90 days. NPM auto-renews, but renewal can
fail silently (DNS propagation issue, port 80 blocked, rate limit hit).

Add a TUI command `[f]` Audit NPM (already exists for route verification) that
also checks certificate expiry dates via the NPM API and flags any cert
expiring within 14 days.

Alert format in TUI:
```
⚠  blog.unenter.live — cert expires in 8 days (renew: NPM → Hosts → Force Renew)
```

### 15. Zone Health Dashboard

Build a persistent status page at `logs.unenter.live/status` (or a dedicated
`status.unenter.live` zone) that shows:

- All zones: name, uptime, last deploy timestamp, health
- Agent status for POWER and L0V3
- Certificate expiry per zone
- Proxy hot-reload events (last routes.json change)

Data sources:
- `/zones/status` agent endpoint (see item 9)
- Supabase `zones` table (last built, zone metadata)
- NPM API (cert expiry)

This gives a single-pane view that's useful during incidents and as a daily
sanity check.

---

## Zone System Evolution

### 16. Zone Split Preparation

All zones currently run as one Next.js monolith (`unt_app:3000`). The proxy
routes by Host header, so splitting a zone into its own deployment is a proxy
config change only — no middleware changes needed.

When splitting a zone:
1. Update the zone's `port` in `ZONES` (multiZone.ts) — only needed for local dev
2. Update the zone's upstream in `routes.json` to point to the new container
3. The proxy hot-reloads in ~100ms

Document this in `UNAXIS.md` under Zone System. The preparation is already
complete — the architecture supports it. The documentation should make this
explicit so the split decision isn't coupled to a big migration.

### 17. Zone Decommission Pipeline

Zone creation has a full pipeline. Zone deletion currently does not.
A decommission should:
1. Remove NPM proxy host (revoke cert or let it expire)
2. Stop + remove the container (`docker compose down`)
3. Remove from `routes.json` (proxy hot-reloads)
4. Delete from Supabase `zones` table
5. Optionally archive source files or leave in repo

Add `[x]` Decommission to the zone action panel with a confirmation prompt.
This prevents orphaned NPM hosts, lingering containers, and stale Supabase rows.

---

## Prioritisation

| Priority | Item | Effort | Risk |
|----------|------|--------|------|
| **Now** | Items 1–3 (cleanup + log zone rebuild + L0V3 confirm) | Low | None |
| **Next sprint** | Items 4–6 (validator extension, rebuild detection, smoke test) | Medium | Low |
| **Next sprint** | Items 7–8 (auto-update L0V3, rollback action) | Medium | Low |
| **Soon** | Items 9–12 (agent zone status, rate limiting, secrets lint) | Medium | Medium |
| **Planned** | Items 13–15 (log aggregation, cert monitoring, status page) | High | Low |
| **Planned** | Items 16–17 (zone split prep docs, decommission pipeline) | Medium | Low |

---

## Invariants to Preserve

These are properties of the current system worth explicitly protecting.
Before any change, confirm these still hold:

1. **`proxy/agent.js` is the single source of truth.** No second agent implementation.
2. **`middleware.ts` re-exports from the project root.** Zone images bake it at build time.
3. **`routes.json` hot-reloads without proxy restart.** Changes are visible in ~100ms.
4. **Compose artifacts live outside the repo.** The Git checkout stays clean.
5. **Zone builds produce three immutable GHCR tags.** `:latest`, date tag, semver tag.
6. **Dynamic zones never need `multiZone.ts` edits.** `getCanonicalHost` and `getZoneConfig`
   handle any `*.unenter.live` subdomain automatically.
7. **`validate.ts` runs before Docker build.** Fail in 50ms, not 30s.
