#!/bin/sh
# packages/agent-updater/updater.sh
# ─────────────────────────────────────────────────────────────────────────────
# UNAXIS Agent Updater — with automatic rollback on health failure.
#
# Flow:
#   1. Inspect running container — clone ports, volumes, group-adds, restart policy
#   2. Rename old container to <name>_rollback and stop it (preserves it for rollback)
#   3. Start new container with cloned config + new image
#   4. Poll Docker health status for up to 100s
#   5a. Healthy  → remove rollback container, done
#   5b. Unhealthy → stop new container, rm it, rename rollback back, start it
#
# Usage (as container entrypoint):
#   updater.sh <container_name> <new_image_ref>
#
# Launched by the agent via Docker API with:
#   -v /var/run/docker.sock:/var/run/docker.sock
#   --rm (AutoRemove: true)
# Runs in its own cgroup — unaffected when Docker stops the agent container.
# ─────────────────────────────────────────────────────────────────────────────

CONTAINER="${1:-unaxis_agent}"
NEW_REF="$2"
ROLLBACK_NAME="${CONTAINER}_rollback"

log() { printf '%s unaxis-updater: %s\n' "$(date '+%Y/%m/%d %H:%M:%S')" "$*"; }

if [ -z "$NEW_REF" ]; then
  log "ERROR — usage: $0 <container_name> <image:tag>"
  exit 1
fi

log "starting update: ${CONTAINER} → ${NEW_REF}"

# ── 1. Inspect running container ──────────────────────────────────────────────
log "inspecting ${CONTAINER} ..."

PORTS=$(docker inspect \
  --format '{{range $port, $bindings := .HostConfig.PortBindings}}{{range $bindings}}-p {{.HostPort}}:{{$port}} {{end}}{{end}}' \
  "$CONTAINER" 2>/dev/null | tr -d '\n') || true

BINDS=$(docker inspect \
  --format '{{range .HostConfig.Binds}}-v {{.}} {{end}}' \
  "$CONTAINER" 2>/dev/null | tr -d '\n') || true

GROUPS=$(docker inspect \
  --format '{{range .HostConfig.GroupAdd}}--group-add {{.}} {{end}}' \
  "$CONTAINER" 2>/dev/null | tr -d '\n') || true

RESTART=$(docker inspect \
  --format '{{.HostConfig.RestartPolicy.Name}}' \
  "$CONTAINER" 2>/dev/null) || true
[ -z "$RESTART" ] && RESTART="unless-stopped"

log "cloned: ports=[${PORTS}] binds=[${BINDS}] groups=[${GROUPS}] restart=${RESTART}"

# ── 2. Rename old container → rollback slot ───────────────────────────────────
# Stop + rename before removing so we have a restore point.
log "preserving rollback: ${CONTAINER} → ${ROLLBACK_NAME}"
docker rm -f "$ROLLBACK_NAME" 2>/dev/null || true   # remove any stale rollback
docker rename "$CONTAINER" "$ROLLBACK_NAME"          # rename while still running
docker stop  "$ROLLBACK_NAME" 2>/dev/null || true    # stop; restart=unless-stopped won't auto-restart

# ── 3. Start new container ────────────────────────────────────────────────────
log "starting new container ${CONTAINER} with ${NEW_REF} ..."
# shellcheck disable=SC2086
docker run -d \
  --name    "$CONTAINER" \
  --restart "$RESTART"  \
  $PORTS \
  $BINDS \
  $GROUPS \
  "$NEW_REF"

# ── 4. HTTP health check via container bridge IP ──────────────────────────────
# We don't rely on Docker's internal HEALTHCHECK (which uses `wget localhost`
# and can fail on Windows Docker Desktop due to DNS resolution inside Alpine).
# Instead we reach the new container directly on its bridge network IP — the
# updater and agent are both on the bridge, so this is always reachable.
log "waiting for ${CONTAINER} to pass HTTP health check (up to 100s) ..."

CONTAINER_IP=$(docker inspect \
  --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
  "$CONTAINER" 2>/dev/null | tr -d '\n') || true

if [ -z "$CONTAINER_IP" ]; then
  log "WARNING: could not determine container IP — falling back to docker inspect health status"
fi

HEALTHY=0
i=0
while [ $i -lt 20 ]; do
  i=$((i + 1))
  sleep 5

  if [ -n "$CONTAINER_IP" ]; then
    # Primary: direct HTTP check to container bridge IP
    if wget -T 3 -qO- "http://${CONTAINER_IP}:8888/health" >/dev/null 2>&1; then
      log "health check ${i}/20: HTTP OK"
      HEALTHY=1
      break
    else
      log "health check ${i}/20: not yet healthy"
    fi
  else
    # Fallback: docker inspect health status
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "missing")
    log "health check ${i}/20: ${STATUS}"
    case "$STATUS" in
      healthy)   HEALTHY=1; break ;;
      unhealthy) log "container reported unhealthy — rolling back"; break ;;
    esac
  fi
done

# ── 5. Commit or rollback ─────────────────────────────────────────────────────
if [ "$HEALTHY" -eq 1 ]; then
  log "update successful — removing rollback container"
  docker rm "$ROLLBACK_NAME" 2>/dev/null || true
  log "done — ${CONTAINER} is running ${NEW_REF}"
else
  log "ERROR: health check failed — rolling back to previous version"
  docker stop "$CONTAINER"          2>/dev/null || true
  docker rm   "$CONTAINER"          2>/dev/null || true
  docker rename "$ROLLBACK_NAME" "$CONTAINER"
  docker start  "$CONTAINER"
  log "rollback complete — ${CONTAINER} restored to previous version"
  exit 1
fi
