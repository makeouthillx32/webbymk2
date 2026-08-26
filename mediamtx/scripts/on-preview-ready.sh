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

while :; do
  rm -f "$FRAME"
  if timeout 15 ffmpeg -nostdin -hide_banner -loglevel error -y \
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
