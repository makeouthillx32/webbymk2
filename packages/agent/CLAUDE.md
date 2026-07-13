# CLAUDE.md — packages/agent (UNAXIS infrastructure agent)

`@untsystems/unaxis-agent` — Bun HTTP service proxying to the local Docker socket on a node (default port 8001). Runs on agent hosts (e.g. the L0V3 node); authenticated via `AGENT_SECRET`.

## Commands

- `bun run dev` — watch mode
- `bun run start` — run `src/index.ts`
- `bun run build` — bundle to `dist/` (target bun)
- `bun run docker:build` / `docker:run` — local image `unaxis/agent:v0`

## Ground rules

- Deployed agents are updated through the UNAXIS **push-agent / self-update** flow, not by hand-editing containers on the node. Load the `unaxis-operator` skill before agent update/rollback work.
- The agent mounts `/var/run/docker.sock` — any endpoint change is effectively root on the host; treat auth and input validation as security-critical.
- Never commit or log real `AGENT_SECRET` values.
- Sibling deployables: `packages/agent-node/` (Dockerfile + deploy.sh) and `packages/agent-updater/` (Dockerfile + updater.sh).
