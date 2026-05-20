# packages/agent/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# UNAXIS Agent v0
#
# Multi-stage build:
#   1. deps    — install dependencies (none for v0, but kept for extensibility)
#   2. runner  — minimal oven/bun:alpine image with source code only
#
# Security notes:
#   - Runs as non-root user "bun" (uid 1000) provided by the oven/bun image.
#   - Docker socket access requires the container to run with the host's
#     docker group GID.  Add  --group-add $(stat -c '%g' /var/run/docker.sock)
#     to the docker run command if you see permission denied errors.
#   - NEVER set AGENT_SECRET in this file — always pass via -e at runtime.
#
# Build:
#   docker build -t unaxis/agent:v0 .
#
# Run:
#   docker run -d \
#     --name unaxis_agent \
#     --restart unless-stopped \
#     -p 8001:8001 \
#     -v /var/run/docker.sock:/var/run/docker.sock \
#     -e AGENT_SECRET="your-secure-secret" \
#     unaxis/agent:v0
# ─────────────────────────────────────────────────────────────────────────────

FROM oven/bun:1-alpine AS base
WORKDIR /app

# ── Stage 1: install deps (none in v0, kept for future npm deps) ──────────────
FROM base AS deps
COPY package.json ./
# No node_modules needed — Bun runs TypeScript natively.
# If you add npm packages later: RUN bun install --frozen-lockfile --production

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

# Copy source
COPY --from=deps /app/package.json ./
COPY src/ ./src/

# Run as non-root (oven/bun:alpine provides user "bun" uid=1000)
USER bun

# Agent listens on 8001 by default (configurable via AGENT_PORT env var)
EXPOSE 8001

# Health check so Docker / orchestrators know the agent is alive.
# Requires curl — install it if missing, or remove and rely on the /health endpoint
# being polled externally by the TUI.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${AGENT_PORT:-8001}/health || exit 1

ENV NODE_ENV=production
ENTRYPOINT ["bun", "run", "src/index.ts"]
