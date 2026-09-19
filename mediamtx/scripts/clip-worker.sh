#!/bin/sh
# Keeps one recent 120s connecting clip for every ready Tank source.
#
# WHY THIS IS A SINGLETON
# -----------------------
# This replaces on-loop-ready.sh, which MediaMTX started per path via
# runOnReady. MediaMTX re-fires runOnReady on EVERY publisher reconnect and
# does not stop the previous worker, so one flapping camera left a worker
# behind on every reconnect — 260 alive against 6 ready paths at the worst
# measurement, and the house went down five times behind it.
#
# The old script grew an impressive amount of machinery to survive that:
# two-slot encode locks, readyTime session pinning, self-termination after N
# ready-misses, startup jitter, SIGKILL escalation. Every one of those exists
# only because copies could exist at all.
#
# One supervised process cannot have copies, so none of that is here. It is
# owned by the _clip_worker path in mediamtx.yml — the same dummy-path pattern
# as _archive_transcoder — which MediaMTX starts once and restarts if it dies.
# Work is sequential, so encode concurrency is 1 by construction rather than by
# lock.
#
# It discovers its own work: every cycle it asks MediaMTX which paths are ready
# and refreshes whichever clips are stale. A camera that appears, disappears or
# reconnects needs no event and leaves nothing behind.

set -u

MTX_API="${MTX_API_URL:-http://127.0.0.1:9997}"
MANAGER_URL="${TANK_RECEIVER_MANAGER_URL:-http://host.docker.internal:5050}"
BUCKET="tank-loops"
CLIP_SECONDS="${TANK_PREROLL_SECONDS:-120}"
REFRESH_SECONDS="${TANK_CLIP_REFRESH_SECONDS:-600}"
CYCLE_SECONDS="${TANK_CLIP_CYCLE_SECONDS:-60}"
MIN_BITRATE_KBPS="${TANK_CLIP_MIN_BITRATE_KBPS:-500}"
KILL_GRACE_SECONDS="${TANK_CLIP_KILL_GRACE_SECONDS:-20}"
WORK_ROOT="/tmp/tank-clips"

log() { echo "[clip-worker] $*"; }

if [ -z "${SUPABASE_INTERNAL_URL:-}" ] || [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
  log "Supabase storage is not configured — clips disabled"
  # Sleep rather than exit: runOnInitRestart would otherwise spin this forever.
  while :; do sleep 3600; done
fi

mkdir -p "$WORK_ROOT"
rm -f "$WORK_ROOT"/*.mp4 "$WORK_ROOT"/*.json 2>/dev/null || true

CLIP_PID=""
cleanup() {
  [ -n "$CLIP_PID" ] && kill "$CLIP_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# Two explicit helpers instead of one generic one. The generic version passed
# the Prefer header as ${EXTRA:+-H "$EXTRA"}, which POSIX sh word-splits into
# broken arguments -- every upsert silently failed while capture and upload
# both succeeded, which is a miserable thing to debug.
sb_get() {
  curl -s -S --max-time 30     -H "apikey: ${SUPABASE_SERVICE_KEY}"     -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}"     "${SUPABASE_INTERNAL_URL}$1" 2>/dev/null || true
}

sb_upsert() {
  curl -s -S -o /dev/null -w "%{http_code}" --max-time 30 -X POST     -H "apikey: ${SUPABASE_SERVICE_KEY}"     -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}"     -H "Content-Type: application/json"     -H "Prefer: resolution=merge-duplicates,return=minimal"     --data "$2" "${SUPABASE_INTERNAL_URL}$1" 2>/dev/null || true
}

# ── discovery ───────────────────────────────────────────────────────────────
# Fixed cameras encode from their own 4K path (GPU downscale to 480p); OBS
# preview paths are already small enough to copy. Anything else is skipped.
ready_paths() {
  curl -s -S --max-time 10 "${MTX_API}/v3/paths/list" 2>/dev/null \
    | tr '{' '\n' \
    | grep '"ready":true' \
    | sed -n 's/.*"name":"\([^"]*\)".*/\1/p' \
    | grep -E '^(cameras/[a-zA-Z0-9_-]+|previews/obs-[a-z0-9-]+)$'     | grep -vE -- '-(hls|hls-low|archive|preview|whep)$'
}

camera_id_for() {
  case "$1" in
    previews/obs-*) echo "obs-$(echo "$1" | sed 's#^previews/obs-##')" ;;
    cameras/*)      echo "$1" | sed 's#^cameras/##' ;;
    *)              echo "" ;;
  esac
}

# ── stability ───────────────────────────────────────────────────────────────
# A clip cut from the first unstable GOP after a reconnect is worse than no
# clip: it becomes the poster every viewer sees while the stream connects.
source_is_stable() {
  SP="$1"; CID="$2"
  case "$SP" in
    previews/obs-*) sleep 10; return 0 ;;
  esac
  TF="${WORK_ROOT}/${CID}.telemetry.json"
  STATUS=$(curl -s -S -o "$TF" -w "%{http_code}" --max-time 6 \
    "${MANAGER_URL}/api/cameras/${CID}/telemetry" 2>/dev/null || true)
  [ "$STATUS" = "200" ] || return 1
  grep -q '"online":true' "$TF" || return 1
  BR=$(sed -n 's/.*"bitrateKbps":\([0-9][0-9.]*\).*/\1/p' "$TF" | head -n 1)
  [ -n "$BR" ] || return 1
  awk -v m="$BR" -v n="$MIN_BITRATE_KBPS" 'BEGIN { exit !(m + 0 >= n + 0) }'
}

# ── capture / validate / publish ────────────────────────────────────────────
capture_clip() {
  SP="$1"; CF="$2"
  rm -f "$CF"
  case "$SP" in
    previews/obs-*)
      timeout -k "$KILL_GRACE_SECONDS" $((CLIP_SECONDS + 45)) ffmpeg -nostdin -hide_banner -loglevel error -y \
        -rtsp_transport tcp -i "rtsp://127.0.0.1:8554/${SP}" \
        -t "$CLIP_SECONDS" -map 0:v:0 -an -c:v copy \
        -movflags +faststart "$CF" 2>/dev/null &
      ;;
    *)
      timeout -k "$KILL_GRACE_SECONDS" $((CLIP_SECONDS + 45)) ffmpeg -nostdin -hide_banner -loglevel error -y \
        -hwaccel cuda -hwaccel_output_format cuda \
        -rtsp_transport tcp -i "rtsp://127.0.0.1:8554/${SP}" \
        -t "$CLIP_SECONDS" -map 0:v:0 -an -vf "scale_cuda=-2:480" \
        -c:v h264_nvenc -preset p4 -rc vbr -cq 30 -b:v 600k \
        -maxrate 800k -bufsize 1200k -g 48 -keyint_min 24 -no-scenecut 1 \
        -movflags +faststart "$CF" 2>/dev/null &
      ;;
  esac
  CLIP_PID=$!
  wait "$CLIP_PID"; ST=$?; CLIP_PID=""
  return "$ST"
}

validate_clip() {
  CF="$1"
  [ -s "$CF" ] || return 1
  CODEC=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$CF" 2>/dev/null | head -n 1)
  HEIGHT=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=noprint_wrappers=1:nokey=1 "$CF" 2>/dev/null | head -n 1)
  DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$CF" 2>/dev/null | head -n 1)
  SIZE=$(wc -c < "$CF" | tr -d ' ')
  [ "$CODEC" = "h264" ] || return 1
  [ -n "$HEIGHT" ] && [ "$HEIGHT" -le 480 ] || return 1
  [ -n "$SIZE" ] && [ "$SIZE" -ge 50000 ] || return 1
  MIN=$((CLIP_SECONDS > 15 ? CLIP_SECONDS - 10 : 5))
  awk -v d="$DURATION" -v m="$MIN" 'BEGIN { exit !(d + 0 >= m + 0) }'
}

publish_clip() {
  CID="$1"; CF="$2"
  GEN=$(date -u +%s)
  OBJ="cameras/${CID}/${GEN}.mp4"
  SIZE=$(wc -c < "$CF" | tr -d ' ')
  DUR=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$CF" 2>/dev/null | cut -d. -f1)
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  UP=$(curl -s -S -o /dev/null -w "%{http_code}" --max-time 180 -X POST \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: video/mp4" \
    -H "Cache-Control: public, max-age=31536000, immutable" \
    --data-binary "@${CF}" \
    "${SUPABASE_INTERNAL_URL}/storage/v1/object/${BUCKET}/${OBJ}" 2>/dev/null || true)
  case "$UP" in 200|201) ;; *) log "${CID}: upload failed (${UP})"; return 1 ;; esac

  BODY="{\"camera_id\":\"${CID}\",\"storage_path\":\"${OBJ}\",\"captured_at\":\"${NOW}\",\"source_stable_at\":\"${NOW}\",\"duration_seconds\":${DUR:-0},\"size_bytes\":${SIZE:-0},\"generation\":${GEN},\"last_attempt_at\":\"${NOW}\",\"last_attempt_status\":\"ready\",\"last_error_code\":null,\"updated_at\":\"${NOW}\"}"
  MS=$(sb_upsert "/rest/v1/tank_camera_clips?on_conflict=camera_id" "$BODY")
  case "$MS" in 200|201|204) ;; *) log "${CID}: metadata failed (${MS})"; return 1 ;; esac

  # Drop the object this one replaced, so the bucket holds one clip per camera
  # rather than one per refresh forever.
  if [ -n "${PREV_OBJ:-}" ] && [ "$PREV_OBJ" != "$OBJ" ]; then
    curl -s -S -o /dev/null --max-time 20 -X DELETE \
      -H "apikey: ${SUPABASE_SERVICE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      --data "{\"prefixes\":[\"${PREV_OBJ}\"]}" \
      "${SUPABASE_INTERNAL_URL}/storage/v1/object/${BUCKET}" 2>/dev/null || true
  fi
  return 0
}

log "singleton clip worker started (clip ${CLIP_SECONDS}s, refresh ${REFRESH_SECONDS}s, cycle ${CYCLE_SECONDS}s)"

while :; do
  NOW_EPOCH=$(date -u +%s)
  FOUND=0

  for SP in $(ready_paths); do
    CID=$(camera_id_for "$SP")
    [ -n "$CID" ] || continue
    FOUND=$((FOUND + 1))

    ROW=$(sb_get "/rest/v1/tank_camera_clips?camera_id=eq.${CID}&select=storage_path,captured_at&limit=1")
    PREV_OBJ=$(printf '%s' "$ROW" | sed -n 's/.*"storage_path":"\([^"]*\)".*/\1/p' | head -n 1)
    CAPTURED=$(printf '%s' "$ROW" | sed -n 's/.*"captured_at":"\([^"]*\)".*/\1/p' | head -n 1)

    # Stale check. An unparseable or absent timestamp means "never captured",
    # which is the safe direction: a redundant clip costs one encode, a missing
    # one costs every viewer a black tile while the stream connects.
    DUE=1
    if [ -n "$CAPTURED" ]; then
      PREV_EPOCH=$(date -u -d "$CAPTURED" +%s 2>/dev/null || echo 0)
      [ "$PREV_EPOCH" -gt 0 ] && [ $((NOW_EPOCH - PREV_EPOCH)) -lt "$REFRESH_SECONDS" ] && DUE=0
    fi
    [ "$DUE" = "1" ] || continue

    if ! source_is_stable "$SP" "$CID"; then
      log "${CID}: source not stable — skipping this cycle"
      continue
    fi

    CF="${WORK_ROOT}/${CID}.mp4"
    if capture_clip "$SP" "$CF" && validate_clip "$CF" && publish_clip "$CID" "$CF"; then
      log "${CID}: published a validated ${CLIP_SECONDS}s clip"
    else
      NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      sb_upsert "/rest/v1/tank_camera_clips?on_conflict=camera_id" \
        "{\"camera_id\":\"${CID}\",\"last_attempt_at\":\"${NOW_ISO}\",\"last_attempt_status\":\"failed\",\"last_error_code\":\"capture_validate_or_publish_failed\",\"updated_at\":\"${NOW_ISO}\"}" >/dev/null
      log "${CID}: refresh failed — previous clip preserved"
    fi
    rm -f "$CF" 2>/dev/null || true
  done

  [ "$FOUND" = "0" ] && log "no ready paths this cycle"
  sleep "$CYCLE_SECONDS"
done
