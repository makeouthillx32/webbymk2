# CLAUDE.md — proxy (unenter.live multi-zone reverse proxy)

`unenter-proxy` — plain Node (>=20) reverse proxy using `http-proxy`. Routes unenter.live traffic to per-zone containers. Files: `server.js` (proxy), `agent.js`, `Dockerfile`.

## Commands

- `node server.js` / `npm run dev` (`node --watch server.js`)
- Runs in the stack as the `proxy` service in root `docker-compose.yml`

## Ground rules

- Before changing routing/auth behavior, run UNAXIS preflight and inspect live state (`unaxis unenter <cmd>`) — load the `unaxis-operator` skill; it has the 502 triage flow.
- Zone routing must stay in sync with the zones defined in `src/zones/` and the zone store in the TUI.
- A successful `unaxis zone <key> build` already reloads the proxy — don't reload manually after deploys. If a public route is wrong but the container is healthy, run zone doctor / route reconciliation instead of rebuilding.
- Zone promotion (core path → subdomain zone) stamps `?_moved=<path>` on redirects for the shared `MovedHereToast` — preserve that param when touching redirect logic. See `vault/Architecture/zone-promotion.md`.
- Keep it dependency-light: `http-proxy` only, no framework.
