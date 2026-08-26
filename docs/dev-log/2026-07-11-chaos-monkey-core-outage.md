---
tags: [unaxis, chaos-engineering, resilience, dev-log]
date: 2026-07-11
---

# Chaos Monkey drill #1 — Core Supabase (kong) outage

## Setup (safety net first)
- Fresh core backup (`db backup`) + full snapshot `2026-07-11-22-22-12` (.tar.gz verified) BEFORE touching anything
- `watch begin` labelled the drill; `watch end` closed it

## Method
Stopped `unt_kong` (Supabase API gateway) via `unaxis env stop unt_kong`. Postgres left running (data safe). Fetched every layer, then restarted kong.

## Findings — how each layer degraded

| Layer | Behavior with kong DOWN | Verdict |
|---|---|---|
| **Core app** (unenter.live, `/about`) | **Naked empty 500** — no shell, no message, blank body | ❌ ugly — server components call supabase, unhandled |
| **Shop zone** | Served full shell + "Loading…" (client-fetch, degraded gracefully) | ✅ acceptable |
| **Docs zone** (/tyler) | Fully intact — markdown is build-time static, zero DB dependency | ✅ perfect |
| `infra check` | Supabase/DB UI/Acct/etc → down; App → up 8ms | ✅ detection works |

Key insight: **static + client-fetch zones survive; server-rendered core dies.** The blast radius is exactly the core app's server components + middleware auth.

## Fixes implemented
1. `src/app/error.tsx` — segment error boundary: branded "Our backend is taking a moment… data may not be fresh" + retry
2. `src/app/global-error.tsx` — root boundary (self-contained html/body) for when the root LAYOUT throws during outage
3. `middleware.ts` — wrapped `supabase.auth.getUser()` in try/catch → degrade to logged-out instead of 500ing every route

## NEW BUG surfaced (unrelated to chaos, pre-existing)
`zone unenter build` / `deploy` fails at the pull+up leg: **`no such service: app`** — yet `app` IS in root docker-compose.yml (line 366). Deploy resolves compose via artifact store (`%APPDATA%\unenter\stacks\<key>\`) → repo zone compose → root compose; the core `app` deploy is resolving to a compose file WITHOUT the `app` service. Image built + pushed fine (`gbfb9fbe1-dirty`). **The degradation fixes are committed to source but NOT yet deployed** because of this. Needs: fix core deploy compose resolution (skill failure-mode #3).

## Restore
kong restarted, `unt_app` running, site verified live on prior image. No data loss. Snapshot retained.

## Follow-ups
1. Fix core `app` deploy compose-resolution bug → then redeploy to activate the graceful-degradation fixes
2. Re-run this drill AFTER fix to confirm core shows the branded message instead of empty 500
3. Future drills: storage-only outage (images), single-zone outage, proxy outage



## RESOLVED — fixes deployed + validated (2026-07-11, same day)

### Deploy bug #1 (compose service resolution) — FIXED
`pullAndUp` special-cases the core zone (key "unenter", service "app") to the ROOT
docker-compose.yml. `zoneComposeExists()` ignores its key arg and only checks the shared
`unenter-zones` artifact (which has blog/shop/docs but no `app`), so core was mis-routed
there → "no such service: app". Core now resolves to root compose.

### Deploy bug #2 (project-name mismatch) — FIXED
Running production stack = compose project **`unenterlive`** (since first bring-up).
Root compose had `name: unenter` (an intended rename that never applied because bug #1
kept core deploy broken). First successful core deploy then collided on the fixed
`unt_db` container name. Per Tyler: one project / one domain, the token is just a label —
changed root compose `name:` → `unenterlive` to match reality (least-surprise; volumes
pinned by explicit `webbymk2_` name so nothing orphaned). Revisit only at multi-project scale.

### Postgres-safety guard added
`pullAndUp` core branch now uses `--no-deps` on `up` so recreating the stateless `app`
container never drags in / recreates unt_db or kong. Verified: after deploy, unt_db +
unt_kong untouched, only unt_app swapped to `:latest`.

### Validation — the resilience fixes WORK
Re-ran the mini-drill with fixes live: stopped kong, fetched core:
- BEFORE fix: `/about` = naked empty 500
- AFTER fix: `/` and `/about` = **HTTP 200, full 48KB branded page** (middleware try/catch
  degrades to logged-out instead of crashing every route)
Restored kong; REST path confirmed serving 200s (blog_posts, homepage_content,
landing_sections). Site fully live; shop 200/40KB.

Note: `infra check` "Supabase down" is a FALSE NEGATIVE — the probe does bare `HEAD /`
which kong answers 404 (no root route). Real /rest/v1 queries return 200. Consider
pointing that probe at `/rest/v1/` or an auth health path.

## STILL PENDING (source vs deployed)
Everything is deployed EXCEPT: this all ran on a dirty working tree (`gbfb9fbe1-dirty`).
Pre-push checklist from earlier still stands: split churn from feature commits, secrets
sweep, then a clean release. The resilience + deploy-fix code is live but uncommitted.



## v2 — toast instead of page takeover (per Tyler's feedback)
Tyler: the full-page error boundary was wrong — it replaced the page AND shadowed the
zone-aware 404. Wanted the existing cross-zone toast system used instead.

### Changes
- DELETED `src/app/error.tsx` + `src/app/global-error.tsx` (restored the real 404 path)
- `middleware.ts`: kept the getUser try/catch as a 500-safety net ONLY (not the detector)
- NEW `src/app/api/health/backend/route.ts`: session-independent liveness probe — pings
  kong `/rest/v1/` (proven path) with anon key, 3s timeout. Any HTTP response = up; a
  thrown fetch = down. Returns {ok}.
- REWROTE `BackendStatusToast.tsx`: probes /api/health/backend once per mount (60s throttle);
  ok:false → fires ONE toast via existing react-hot-toast AppToaster; ok:true → dismisses it.
- Mounted in `ClientLayout` (rendered by EVERY zone) → genuinely cross-zone, not core-only.

### Key discovery (why the first toast approach failed)
Middleware `getUser()` only hits the backend for LOGGED-IN users. Anonymous visitors get
AuthSessionMissingError with NO network call, so a cookie-from-middleware approach can't
detect an outage for the majority (public) traffic. The dedicated health route fixes this —
works for every visitor.

Also: probing `/auth/v1/health` threw (kong routing/path); `/rest/v1/` is the reliable path.

### Validated end-to-end (curl, session-independent so fully testable without a browser)
- kong UP   → /api/health/backend = {"ok":true}
- kong DOWN → {"ok":false,"reason":"unreachable"}, /about still HTTP 200 (no takeover)
- kong restored → {"ok":true}
Visual toast render itself needs a browser eyeball (Chrome ext not connected this session),
but the signal it consumes is proven correct.

### Still pending
- Roll to other public zones (shared src/ change → each zone image needs rebuild to get it)
- Clean commits / secrets sweep / release (still on dirty tree)
- Optional: point `infra check` Supabase probe at /rest/v1/ (currently false-negative on HEAD /)
