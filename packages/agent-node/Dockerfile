# packages/agent-node/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# UNAXIS Agent — standalone Docker socket proxy.
#
# Pure Node.js, zero npm dependencies.
# Deploy on any remote machine to give the UNAXIS TUI full Docker control.
#
# Build:
#   docker build -t ghcr.io/makeouthillx32/unaxis-agent:v0 .
#
# Deploy on a remote machine (e.g. L0VE):
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

WORKDIR /app

# Copy agent source — no deps, no install step needed.
COPY agent.js ./
COPY handler/ ./handler/

# /data stores the TOFU pairing state (paired TUI public key).
# Mount a named volume to survive container restarts:
#   -v unaxis_agent_data:/data
# Note: runs as root so it can read /var/run/docker.sock and write /data.
# This agent is LAN-only (port 8888 must not be exposed to the internet).
VOLUME ["/data"]

EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${AGENT_PORT:-8888}/health || exit 1

ENV NODE_ENV=production

ENTRYPOINT ["node", "agent.js"]
