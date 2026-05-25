# packages/agent-node/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# UNAXIS Agent — standalone Docker socket proxy.
#
# Single source of truth: proxy/agent.js (shared with the embedded proxy agent).
# Build context must be the repo root so we can COPY from proxy/:
#
#   docker build -f packages/agent-node/Dockerfile \
#                -t ghcr.io/makeouthillx32/unaxis-agent:v0 .
#
# (TUI handles this automatically via buildAndPushAgent in agent-ops.ts.)
#
# Deploy on a remote machine (e.g. L0V3):
#   docker run -d \
#     --name unaxis_agent \
#     --restart unless-stopped \
#     -p 8888:8888 \
#     -v /var/run/docker.sock:/var/run/docker.sock \
#     -v unaxis_agent_data:/data \
#     --group-add $(stat -c '%g' /var/run/docker.sock) \
#     ghcr.io/makeouthillx32/unaxis-agent:v0
#
# No secrets, no configuration. The first UNAXIS TUI to connect pairs
# automatically via TOFU (Trust on First Use). The /data volume persists
# the pairing across container restarts.
#
# Security: keep port 8888 on a trusted private network (VPN / LAN only).
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine

# Install Docker CLI + Compose plugin so the agent can:
#   - docker pull / docker run   (POST /self-update self-replacement)
#   - docker compose up -d       (POST /stacks/deploy)
# Only the CLI client is installed — no daemon, no overhead.
RUN apk add --no-cache docker-cli docker-cli-compose

WORKDIR /app

# Copy unified agent source from proxy/ (single source of truth).
# Build context must be the repo root — see comment at top.
COPY proxy/agent.js ./agent.js

# /data stores the TOFU pairing state (paired TUI public key).
# Mount a named volume to survive container restarts:
#   -v unaxis_agent_data:/data
# Note: runs as root so it can read /var/run/docker.sock and write /data.
# This agent is LAN-only (port 8888 must not be exposed to the internet).
VOLUME ["/data"]

EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${AGENT_PORT:-8888}/health || exit 1

ENV NODE_ENV=production

ENTRYPOINT ["node", "agent.js"]
