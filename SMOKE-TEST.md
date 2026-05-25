# UNAXIS Proxy + Agent Smoke Test

Verify the new unified-agent architecture and redesigned proxy action panel.
This is NOT a general TUI walkthrough — it targets exactly what changed.

---

## What changed (what we're testing)

1. **Unified agent** — `proxy/agent.js` is now the single source of truth.
   POWER runs it via bind-mount + node --watch. L0V3 runs it from the GHCR image.
2. **Proxy action panel redesigned** — `[b]` and `[a]` are now separate.
   Build proxy rebuilds the Docker image. Push agent publishes to GHCR. Not combined.
3. **`[s]` Sync routes** — was a stub. Now calls `addZoneRoute` for every zone.
4. **`[f]` Audit NPM** — was a stub. Now calls `npmAddZone` for every zone.
5. **`reloadProxy`** — no longer triggers a Next.js rebuild (`--no-build` fix).

---

## Test 1 — Proxy action panel looks right

`home › core` → navigate to **Proxy** row → `↵`

Expected action list (in this order):

```
[r]  Restart
[b]  Build proxy       ← image rebuild only, no agent
[R]  Rebuild proxy (clean)
[a]  Push agent        ← GHCR publish only, no proxy image
[l]  Logs
[k]  Reset pairing
[s]  Sync routes       ← was a stub
[f]  Audit NPM         ← was a stub
```

**Fail if:** You still see `[n] Register NPM`, `[s] Manage sections`, `[f] Fix routing` — those were the old stubs and must be gone.

---

## Test 2 — `[s]` Sync routes fires (not stub)

From the proxy action panel → press `[s]`

Expected: operation panel opens, you see output like:
```
✓ proxy route added:  blog.unenter.live  →  http://blog:3000
✓ proxy route added:  shop.unenter.live  →  http://shop:3000
...
✓ routes.json synced  (N zones)
```

**Fail if:** You see "not yet wired in core panel" notification — the stub is still running.

---

## Test 3 — `[f]` Audit NPM fires (not stub)

From the proxy action panel → press `[f]`

Expected: operation panel opens, iterates all zones against NPM:
```
── Blog  (blog.unenter.live) ──
...
── Shop  (shop.unenter.live) ──
...
✓ All N NPM hosts verified
```

**Fail if:** Stub notification appears instead of the operation running.

---

## Test 4 — Agent versions match on both nodes

`Tab` to **env** panel → press `[p]` on each environment

| Node | Expected |
|------|----------|
| POWER | `● agent online  v1.0.0` |
| L0V3  | `● agent online  v1.0.0` |

**Fail if:** Either node is offline, or versions differ (L0V3 behind = needs `[u]`).

---

## Test 5 — `[b]` Build proxy does NOT touch the agent

From proxy action panel → press `[b]`

Expected output:
```
Building proxy image...
docker compose build proxy
...
Recreating proxy container (unt_proxy)...
✓ done
```

**Fail if:** You see any reference to `ghcr.io/makeouthillx32/unaxis-agent` — that
means build + push are still combined and the separation didn't take.

---

## Test 6 — `[a]` Push agent does NOT touch the proxy image

From proxy action panel → press `[a]`

Expected output:
```
Building agent image...
docker build -f packages/agent-node/Dockerfile ...
Pushing ghcr.io/makeouthillx32/unaxis-agent:v0 ...
✓ Agent image pushed — go to Environments → [u] on L0V3 to deploy
```

**Fail if:** You see `docker compose build proxy` in the output — proxy build is leaking in.
