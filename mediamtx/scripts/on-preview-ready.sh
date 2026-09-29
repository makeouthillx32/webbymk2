#!/bin/sh
# Maintains a recent public still while a media path is ready. IRL and OBS
# sources use their already-downscaled 360p preview rung. Fixed cameras avoid
# six permanent thumbnail encoders: they decode exactly one frame from their
# already-live path, then sleep for a minute.

set -u

STREAM_PATH="${MTX_PATH:-}"
INTERVAL="${TANK_OG_SNAPSHOT_INTERVAL_SECONDS:-}"

log() { echo "[og-snapshot] $*"; }

# Clip capture is a separate child so the cheap one-frame share-card loop stays
# responsive while a two-minute clip is being recorded. Main SRTLA paths opt
# out in mediaGateway.ts because their already-downscaled preview sibling owns
# the clip instead; fixed camera main paths and OBS preview paths run it here.
CLIP_PID=""
if [ "${TANK_CLIP_ENABLED:-1}" = "1" ]; then
  /bin/sh /scripts/on-loop-ready.sh &
  CLIP_PID=$!
fi

case "$STREAM_PATH" in
  cameras/*-preview)
    ASSET_KIND="cameras"
    ASSET_ID=$(echo "$STREAM_PATH" | sed 's#^cameras/##; s#-preview$##')
    [ -z "$INTERVAL" ] && INTERVAL=30
    ;;
  cameras/*)
    ASSET_KIND="cameras"
    ASSET_ID=$(echo "$STREAM_PATH" | sed 's#^cameras/##')
    [ -z "$INTERVAL" ] && INTERVAL=60
    ;;
  previews/obs-*)
    ASSET_KIND="rooms"
    ASSET_ID=$(echo "$STREAM_PATH" | sed 's#^previews/obs-##')
    [ -z "$INTERVAL" ] && INTERVAL=30
    ;;
  *)
    log "unsupported preview path '${STREAM_PATH}'"
    exit 0
    ;;
esac

if [ -z "$ASSET_ID" ] || [ -z "${SUPABASE_INTERNAL_URL:-}" ] || [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
  log "snapshot storage is not configured for '${STREAM_PATH}'"
  exit 0
fi

FRAME="/tmp/tank-og-${ASSET_KIND}-${ASSET_ID}-$$.jpg"
cleanup() {
  if [ -n "$CLIP_PID" ]; then
    kill "$CLIP_PID" 2>/dev/null || true
    wait "$CLIP_PID" 2>/dev/null || true
  fi
  rm -f "$FRAME"
}
trap cleanup EXIT INT TERM

# ── Self-termination ────────────────────────────────────────────────────────
# MediaMTX does not reliably stop runOnReady hooks when a path stops being
# ready. Measured on this container 2026-09-10: 260 of these workers alive
# against 6 ready camera paths, accumulated over ~30h of receiver reconnects,
# plus 255 stale files left in the clip workdir. Nothing in the Tank codebase
# deletes a MediaMTX path, so no teardown call was ever going to reap them.
#
# So each worker decides for itself. It asks MediaMTX whether its own path is
# still ready and exits once it clearly is not. Exiting runs the EXIT trap,
# which releases the encode slot and removes this worker's temp files.
#
# A failed or empty API read counts as "still ready" on purpose: a blip in the
# control API must never take down workers for paths that are serving fine.
# Several consecutive misses are required so a brief reconnect does not kill a
# live worker either.
MTX_API="${MTX_API_URL:-http://127.0.0.1:9997}"
READY_MISSES=0
MAX_READY_MISSES="${TANK_HOOK_MAX_READY_MISSES:-3}"

# THE SESSION THIS WORKER OWNS.
#
# "Is my path ready?" was not enough, and the gap is the whole leak. MediaMTX
# re-fires runOnReady on EVERY publisher reconnect, so a camera that drops and
# comes back gets a second worker while the first is mid-sleep. The first then
# asks "is my path ready?", sees the NEW session's true, resets its miss count
# and lives forever. Every reconnect left one behind, permanently.
#
# Measured on this container 2026-09-13: 118 on-preview-ready workers and 92
# on-loop-ready children against 20 ready paths — 447% CPU and 6.2 GiB in a
# process tree that should be a couple of dozen.
#
# readyTime changes on every re-establish, so pinning it at startup makes each
# worker own exactly one session and stand down the moment a newer one has
# taken over.
read_ready_state() {
  ENCODED=$(printf '%s' "$STREAM_PATH" | sed 's#/#%2F#g')
  curl -s -S --max-time 5 "${MTX_API}/v3/paths/get/${ENCODED}" 2>/dev/null
}

extract_ready_time() {
  printf '%s' "$1" | sed -n 's/.*"readyTime":"\([^"]*\)".*//p' | head -n 1
}

MY_READY_TIME=""
MY_READY_TIME=$(extract_ready_time "$(read_ready_state)")

path_still_ready() {
  BODY=$(read_ready_state) || return 0
  [ -n "$BODY" ] || return 0

  case "$BODY" in
    *'"ready":true'*) ;;
    *) return 1 ;;
  esac

  # Ready — but is it still OUR session? A different readyTime means the path
  # was re-established and a newer worker is handling it; this one is surplus
  # and must stand down immediately rather than burn a miss count it will keep
  # resetting. Only enforced when both values are known, so an API that stops
  # reporting readyTime degrades to the old behaviour instead of mass-exiting
  # every worker at once.
  if [ -n "$MY_READY_TIME" ]; then
    CURRENT_READY_TIME=$(extract_ready_time "$BODY")
    if [ -n "$CURRENT_READY_TIME" ] && [ "$CURRENT_READY_TIME" != "$MY_READY_TIME" ]; then
      log "${STREAM_PATH}: path re-established (${MY_READY_TIME} -> ${CURRENT_READY_TIME}) — newer worker owns it, exiting"
      exit 0
    fi
  fi
  return 0
}

exit_when_path_is_gone() {
  if path_still_ready; then
    READY_MISSES=0
    return 0
  fi
  READY_MISSES=$((READY_MISSES + 1))
  if [ "$READY_MISSES" -ge "$MAX_READY_MISSES" ]; then
    log "${STREAM_PATH}: path not ready for ${READY_MISSES} consecutive checks — exiting"
    exit 0
  fi
}

while :; do
  exit_when_path_is_gone
  rm -f "$FRAME"
  # -k for the same reason as on-loop-ready.sh: plain `timeout` sends SIGTERM
  # and then waits indefinitely. This loop is `while :;`, so one wedged frame
  # grab stalls this camera's snapshots permanently while holding an RTSP reader.
  if timeout -k 10 15 ffmpeg -nostdin -hide_banner -loglevel error -y \
      -rtsp_transport tcp -i "rtsp://127.0.0.1:8554/${STREAM_PATH}" \
      -frames:v 1 \
      -vf "scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630" \
      -q:v 3 "$FRAME" 2>/dev/null && [ -s "$FRAME" ]; then
    STATUS=$(curl -s -S -o /dev/null -w "%{http_code}" --max-time 30 \
      -X POST \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
      -H "Content-Type: image/jpeg" \
      -H "Cache-Control: public, max-age=20" \
      -H "x-upsert: true" \
      --data-binary "@${FRAME}" \
      "${SUPABASE_INTERNAL_URL}/storage/v1/object/tank-loops/${ASSET_KIND}/${ASSET_ID}.jpg" 2>/dev/null)
    case "$STATUS" in
      200|201) log "refreshed ${ASSET_KIND}/${ASSET_ID}.jpg" ;;
      *) log "upload failed (HTTP ${STATUS:-000}) for ${ASSET_KIND}/${ASSET_ID}.jpg" ;;
    esac
  else
    log "frame capture failed for '${STREAM_PATH}'"
  fi
  rm -f "$FRAME"
  sleep "$INTERVAL"
done
