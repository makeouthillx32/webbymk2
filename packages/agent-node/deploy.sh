#!/bin/sh
# packages/agent-node/deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
# Full agent deploy: build both images, push both to GHCR, redeploy on L0V3.
#
# Usage:
#   sh deploy.sh                     # build + push + redeploy
#   sh deploy.sh --build-only        # build + push, skip redeploy
#
# Prerequisites:
#   docker login ghcr.io -u makeouthillx32
#   L0V3 accessible (for redeploy step)
# ─────────────────────────────────────────────────────────────────────────────

set -e

AGENT_IMAGE="ghcr.io/makeouthillx32/unaxis-agent:v0"
UPDATER_IMAGE="ghcr.io/makeouthillx32/unaxis-updater:v0"
CONTAINER="unaxis_agent"

# Resolve script location so paths work regardless of cwd
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
AGENT_DIR="${REPO_ROOT}/packages/agent-node"
UPDATER_DIR="${REPO_ROOT}/packages/agent-updater"

BUILD_ONLY=0
for arg in "$@"; do
  [ "$arg" = "--build-only" ] && BUILD_ONLY=1
done

log() { printf '\033[1;34m▶\033[0m %s\n' "$*"; }
ok()  { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ── 1. Build agent image ──────────────────────────────────────────────────────
log "Building ${AGENT_IMAGE} ..."
docker build -t "$AGENT_IMAGE" -f "$AGENT_DIR/Dockerfile" "$REPO_ROOT" || err "Agent build failed"
ok "Agent image built"

# ── 2. Build updater image ────────────────────────────────────────────────────
log "Building ${UPDATER_IMAGE} ..."
docker build -t "$UPDATER_IMAGE" "$UPDATER_DIR" || err "Updater build failed"
ok "Updater image built"

# ── 3. Push both to GHCR ─────────────────────────────────────────────────────
log "Pushing ${AGENT_IMAGE} ..."
docker push "$AGENT_IMAGE" || err "Agent push failed"
ok "Agent pushed"

log "Pushing ${UPDATER_IMAGE} ..."
docker push "$UPDATER_IMAGE" || err "Updater push failed"
ok "Updater pushed"

[ "$BUILD_ONLY" -eq 1 ] && { ok "Build-only mode — done."; exit 0; }

# ── 4. Redeploy on L0V3 ──────────────────────────────────────────────────────
# This step is only needed for the one-time bootstrap to v0.1.6.
# After that, use the TUI `u` key — it calls /self-update which launches
# the updater container automatically.
log "Redeploying ${CONTAINER} on L0V3 ..."
docker --host tcp://love:8888 stop  "$CONTAINER" 2>/dev/null || true
docker --host tcp://love:8888 rm    "$CONTAINER" 2>/dev/null || true
docker --host tcp://love:8888 pull  "$AGENT_IMAGE"
docker --host tcp://love:8888 run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  -p 8888:8888 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v unaxis_agent_data:/data \
  "$AGENT_IMAGE"
ok "Redeployed — ${CONTAINER} running ${AGENT_IMAGE} on L0V3"
