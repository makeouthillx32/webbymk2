# Proxy / Dev Mode Breakage Report

Date: 2026-05-17
Workspace: `Z:\WEBSITES\webbymk2`

## Executive Summary

The proxy itself is running and its admin API is healthy, but its live route table is out of sync with the actual Docker environment. The immediate broken path is `dev.blog.unenter.live`: `proxy-config/routes.json` routes it to `http://dev-blog:3000`, but there is no `dev-blog` container. Requests to that host return `502 Bad Gateway`.

This appears connected to the recent dev-mode update because the dev-mode system now creates dev routes like `dev.<zone>.unenter.live`, while the route table can keep those routes after the corresponding dev container is gone. The core dev route was also removed from `routes.json`, so `dev.unenter.live` currently falls through to the core upstream instead of explicitly routing to `dev-core`.

## Current Live State

Proxy container:

```text
unt_proxy: running
public proxy port: 3080
admin API: 127.0.0.1:3081
admin health: {"ok":true,"routes":3}
```

Loaded proxy routes:

```json
{
  "coreDomain": "unenter.live",
  "coreUpstream": "http://unt_app:3000",
  "zones": {
    "dev.blog": "http://dev-blog:3000"
  }
}
```

Relevant containers:

```text
unt_proxy: running
unt_app: running, healthy
unt_blog: running, healthy
unt_shop: running, healthy
dev-blog: missing
dev-core: missing
```

Request checks:

```text
Host: dev.blog.unenter.live -> 502
Host: dev.unenter.live      -> 200, but by fallback to unt_app, not dev-core
Host: blog.unenter.live     -> 302 to /blog
Host: unenter.live          -> 200
```

## What Changed

The working tree shows these relevant changes:

```diff
proxy-config/routes.json
- "dev.blog": "http://dev-blog:3000",
- "dev": "http://dev-core:3000"
+ "dev.blog": "http://dev-blog:3000"
```

```diff
src/ink/dev-container.ts
+ WATCHPACK_POLLING=true
+ CHOKIDAR_USEPOLLING=true
+ NEXT_WEBPACK_USEPOLLING=1
- bun install && bun dev
+ rm -rf .next && bun install && bun dev
```

The polling and `.next` cleanup changes are probably not the direct routing failure. The direct routing failure is that `routes.json` still references `dev-blog` after that container is gone, and no longer references `dev-core`.

## Probable Root Cause

The dev-mode lifecycle is not fully transactional across:

1. Docker dev container state
2. `proxy-config/routes.json`
3. proxy admin reload
4. NPM proxy host registration
5. Next middleware zone detection

When a dev container stops, crashes, fails to start, or is manually removed, its proxy route can remain behind. The proxy then routes public traffic to a Docker DNS name that no longer exists, producing `502`.

There is also a naming/semantics mismatch:

- Dev route key for blog: `dev.blog`
- Public dev host: `dev.blog.unenter.live`
- Docker upstream: `http://dev-blog:3000`
- Middleware now treats any `dev.*.unenter.live` host as local development.

That last point means the middleware uses path-based zone detection for dev hosts. For `dev.blog.unenter.live/`, the path is `/`, so the middleware may classify the request as the `unenter` zone instead of `blog` once the dev container is running. The proxy may send the traffic to the right dev container, but the app layer can still think it is on the wrong zone for root paths.

## Important Code References

- `proxy/server.js`
  - Loads routes from `/proxy-config/routes.json`.
  - Resolves by `x-forwarded-host` or `host`.
  - Provides `POST /reload` and `GET /health`.

- `src/ink/proxy-config.ts`
  - Writes `proxy-config/routes.json`.
  - Calls proxy admin reload after writes.

- `src/ink/dev-container.ts`
  - Starts `dev-<zone>` containers.
  - Adds `dev.<zone>` proxy routes.
  - Removes routes on normal stop.

- `src/lib/multiZone.ts`
  - Defines dev-host detection.
  - Recent change recognizes `dev.blog.unenter.live`.

- `middleware.ts`
  - Uses `x-forwarded-host` first.
  - Uses path-based zone detection for dev hosts.

## Risks

1. Stale dev routes can break public dev URLs with `502`.
2. A missing explicit `dev` route means `dev.unenter.live` silently serves production/core app instead of failing clearly or using `dev-core`.
3. Dev subdomain root paths can lose zone identity because middleware falls back to path detection.
4. Proxy route state is not reconciled against Docker state automatically.
5. Route repair is mostly hidden in TUI actions rather than surfaced as a gateway health issue.

## Recommended Fix Path

1. Add a gateway doctor check.
   - Compare `routes.json` against running Docker containers.
   - Mark any route whose upstream host has no container as stale.
   - Example stale route today: `dev.blog -> http://dev-blog:3000`.

2. Make dev-route cleanup resilient.
   - On TUI startup, scan `routes.json`.
   - Remove `dev.*` routes whose containers are missing.
   - Or show them as broken and offer one-key cleanup.

3. Decide expected behavior for `dev.unenter.live`.
   - If `dev-core` is not running, remove the route and make that explicit.
   - If dev mode is active for core, restore `"dev": "http://dev-core:3000"`.

4. Fix dev host zone detection.
   - For `dev.<zone>.unenter.live`, infer `<zone>` from the host.
   - Do not classify `dev.blog.unenter.live/` as core just because the path is `/`.

5. Preserve original forwarded host in the proxy.
   - `proxy/server.js` reads `x-forwarded-host`, but later overwrites it with `host`.
   - Preserve the incoming `x-forwarded-host` when present so Next middleware sees the public host NPM supplied.

6. Promote "Gateway" to first-class TUI concept.
   - Show DNS/DDNS, NPM host, proxy route, Docker upstream, and app zone as one chain.
   - Make "Fix routing" reconcile all layers, not only add a missing route.

## Immediate Manual Recovery Options

If no blog dev container should be running:

```json
{
  "coreDomain": "unenter.live",
  "coreUpstream": "http://unt_app:3000",
  "zones": {}
}
```

Then reload the proxy:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3081/reload
```

If blog dev mode should be running, start `dev-blog` first, then keep:

```json
"dev.blog": "http://dev-blog:3000"
```

If core dev mode should be running, start `dev-core`, then include:

```json
"dev": "http://dev-core:3000"
```

## Bottom Line

The proxy is not dead. It is doing exactly what its route table says. The break is that dev mode left the route table pointing at a missing dev container, and the new dev-host model needs a reconciliation pass so proxy state, Docker state, and middleware zone detection all agree.
