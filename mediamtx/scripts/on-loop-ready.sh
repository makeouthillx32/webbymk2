#!/bin/sh
# Maintains one validated, recent connecting clip for every ready Tank source.
#
# This runs inside MediaMTX, where the live RTSP path, FFmpeg, GPU, curl, and
# Supabase service credential already exist. Each ready path owns its own loop;
# a tiny shared slot lock caps simultaneous encodes so six 4K cameras cannot
# spike the GPU/CPU together after a stack restart.

set -u

STREAM_PATH="${MTX_PATH:-}"
CLIP_SECONDS="${TANK_PREROLL_SECONDS:-120}"
REFRESH_SECONDS="${TANK_CLIP_REFRESH_SECONDS:-600}"
RETRY_SECONDS="${TANK_CLIP_RETRY_SECONDS:-60}"
MAX_ENCODERS="${TANK_CLIP_MAX_CONCURRENT:-2}"
MIN_BITRATE_KBPS="${TANK_CLIP_MIN_BITRATE_KBPS:-500}"
MANAGER_URL="${TANK_RECEIVER_MANAGER_URL:-http://host.docker.internal:5050}"
BUCKET="tank-loops"

log() { echo "[clip-worker] $*"; }

case "$STREAM_PATH" in
  cameras/*-preview)
    CAMERA_ID=$(echo "$STREAM_PATH" | sed 's#^cameras/##; s#-preview$##')
    INPUT_IS_PREVIEW=1
    REQUIRE_MANAGER_STABILITY=1
    ;;
  cameras/*)
    CAMERA_ID=$(echo "$STREAM_PATH" | sed 's#^cameras/##')
    INPUT_IS_PREVIEW=0
    REQUIRE_MANAGER_STABILITY=1
    ;;
  previews/obs-*)
    CAMERA_ID="obs-$(echo "$STREAM_PATH" | sed 's#^previews/obs-##')"
    INPUT_IS_PREVIEW=1
    REQUIRE_MANAGER_STABILITY=0
    ;;
  *)
    log "unsupported clip path '${STREAM_PATH}'"
    exit 0
    ;;
esac

case "$CAMERA_ID" in
  ''|*[!a-zA-Z0-9_-]*)
    log "unsafe camera id derived from '${STREAM_PATH}'"
    exit 0
    ;;
esac

if [ -z "${SUPABASE_INTERNAL_URL:-}" ] || [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
  log "Supabase storage/metadata is not configured for '${STREAM_PATH}'"
  exit 0
fi

WORK_ROOT="/tmp/tank-clips"
mkdir -p "$WORK_ROOT"
CLIP_FILE="${WORK_ROOT}/${CAMERA_ID}-$$.mp4"
TELEMETRY_FILE="${WORK_ROOT}/${CAMERA_ID}-$$.telemetry.json"
META_FILE="${WORK_ROOT}/${CAMERA_ID}-$$.metadata.json"
HELD_SLOT=""

release_slot() {
  if [ -n "$HELD_SLOT" ]; then
    rm -f "${HELD_SLOT}/pid" 2>/dev/null || true
    rmdir "$HELD_SLOT" 2>/dev/null || true
    HELD_SLOT=""
  fi
}

cleanup() {
  # Kill the encode FIRST. Releasing the slot while ffmpeg is still running
  # would let another hook start a second encode alongside the one this script
  # is abandoning, which is how a single flapping camera ended up with a dozen
  # live ffmpeg processes against it.
  if [ -n "${CLIP_PID:-}" ]; then
    kill "$CLIP_PID" 2>/dev/null || true
    # TERM is enough for `timeout`, which passes it on and then escalates to
    # KILL on its own via -k. No second kill needed here.
  fi
  release_slot
  rm -f "$CLIP_FILE" "$TELEMETRY_FILE" "$META_FILE" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

acquire_slot() {
  while :; do
    exit_when_path_is_gone
    SLOT=1
    while [ "$SLOT" -le "$MAX_ENCODERS" ]; do
      DIR="${WORK_ROOT}/slot-${SLOT}"
      if mkdir "$DIR" 2>/dev/null; then
        echo "$$" > "${DIR}/pid"
        HELD_SLOT="$DIR"
        return 0
      fi

      # Reclaim a lock only when its recorded process no longer exists.
      OLD_PID=$(cat "${DIR}/pid" 2>/dev/null || true)
      if [ -n "$OLD_PID" ] && ! kill -0 "$OLD_PID" 2>/dev/null; then
        rm -f "${DIR}/pid" 2>/dev/null || true
        rmdir "$DIR" 2>/dev/null || true
      fi
      SLOT=$((SLOT + 1))
    done
    sleep 5
  done
}

post_attempt() {
  STATUS="$1"
  ERROR_CODE="${2:-}"
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  PAYLOAD="{\"camera_id\":\"${CAMERA_ID}\",\"last_attempt_at\":\"${NOW}\",\"last_attempt_status\":\"${STATUS}\",\"last_error_code\":${ERROR_CODE:+\"${ERROR_CODE}\"},\"updated_at\":\"${NOW}\"}"
  if [ -z "$ERROR_CODE" ]; then
    PAYLOAD="{\"camera_id\":\"${CAMERA_ID}\",\"last_attempt_at\":\"${NOW}\",\"last_attempt_status\":\"${STATUS}\",\"last_error_code\":null,\"updated_at\":\"${NOW}\"}"
  fi
  curl -s -S -o /dev/null --max-time 20 \
    -X POST \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=minimal" \
    --data "$PAYLOAD" \
    "${SUPABASE_INTERNAL_URL}/rest/v1/tank_camera_clips?on_conflict=camera_id" 2>/dev/null || true
}

manager_sample_is_stable() {
  STATUS=$(curl -s -S -o "$TELEMETRY_FILE" -w "%{http_code}" --max-time 5 \
    "${MANAGER_URL}/api/cameras/${CAMERA_ID}/telemetry" 2>/dev/null || true)
  [ "$STATUS" = "200" ] || return 1
  # Keep the hook runnable in the deployed MediaMTX image. The telemetry shape
  # is a server-owned, single-line JSON contract; these exact keys are safer
  # here than adding a Python runtime dependency to every clip attempt.
  grep -q '"online":true' "$TELEMETRY_FILE" || return 1
  grep -q '"receiverOnline":true' "$TELEMETRY_FILE" || return 1
  BITRATE_KBPS=$(sed -n 's/.*"bitrateKbps":\([0-9][0-9.]*\).*/\1/p' "$TELEMETRY_FILE" | head -n 1)
  [ -n "$BITRATE_KBPS" ] || return 1
  awk -v measured="$BITRATE_KBPS" -v minimum="$MIN_BITRATE_KBPS" \
    'BEGIN { exit !(measured + 0 >= minimum + 0) }'
}

source_is_stable() {
  if [ "$REQUIRE_MANAGER_STABILITY" = "0" ]; then
    # MediaMTX invokes this worker only after the OBS preview path is ready.
    # A brief dwell prevents publishing a clip from the first unstable GOP.
    sleep 20
    return 0
  fi

  manager_sample_is_stable || return 1
  STABLE_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  sleep 15
  manager_sample_is_stable || return 1
  return 0
}

previous_storage_path() {
  curl -s -S --max-time 10 \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    "${SUPABASE_INTERNAL_URL}/rest/v1/tank_camera_clips?camera_id=eq.${CAMERA_ID}&select=storage_path&limit=1" \
    -o "$META_FILE" 2>/dev/null || return 0
  sed -n 's/.*"storage_path":"\(cameras\/[a-zA-Z0-9_\/-]*\.mp4\)".*/\1/p' "$META_FILE" | head -n 1
}

# How long after SIGTERM before we stop asking nicely.
#
# `timeout N` sends SIGTERM and then WAITS - for as long as it takes. That is
# not a timeout, and on 2026-09-12 it left a clip encode alive 327 seconds into
# a 165-second limit, holding ~425 MB, a CUDA context and an RTSP reader on a
# live camera. Every such hang is permanent: the refresh loop starts a new
# encode every REFRESH_SECONDS per camera, so they accumulate.
#
# The cause was the encode wedging inside the WSL2 GPU paravirt driver
# (/proc/<pid>/wchan = dxgvmb_send_sync_msg). ffmpeg catches SIGTERM but could
# not act on it while stuck in that call. SIGKILL DOES reap it - verified by
# hand, though it took ~10s to unwind - and `timeout` never sends SIGKILL
# unless -k says to. Hence this.
#
# 20s because the unwind is not instant, and killing a healthy-but-slow encode
# early would only churn the clip for no reason.
KILL_GRACE_SECONDS="${TANK_CLIP_KILL_GRACE_SECONDS:-20}"

# Pid of the encode currently running, so cleanup() can reach it. Empty when
# nothing is encoding. Declared here because this script runs under `set -u`.
CLIP_PID=""

# Run the encode in the BACKGROUND and remember its pid.
#
# It used to run in the foreground, which meant the exit trap had no way to
# reach it: when MediaMTX tore this hook down (a path going away, a reload, a
# restart) the script exited and its ffmpeg carried on as an orphan. Orphans
# reparent to PID 1 — which in this container is mediamtx itself, a Go binary
# that never calls wait() — so each one became a permanent zombie AND, until it
# finished, kept burning a GPU/CPU slot for a clip nobody would ever collect.
#
# Measured 2026-09-13: 966 processes in the container, 561 of them defunct
# ffmpeg, host CPU at 88% with the operator "not even doing anything".
#
# on-preview-ready.sh next door has always done it this way. This is the same
# pattern, not a new invention.
capture_clip() {
  rm -f "$CLIP_FILE"
  if [ "$INPUT_IS_PREVIEW" = "1" ]; then
    timeout -k "$KILL_GRACE_SECONDS" $((CLIP_SECONDS + 45)) ffmpeg -nostdin -hide_banner -loglevel error -y \
      -rtsp_transport tcp -i "rtsp://127.0.0.1:8554/${STREAM_PATH}" \
      -t "$CLIP_SECONDS" -map 0:v:0 -an -c:v copy \
      -movflags +faststart "$CLIP_FILE" 2>/dev/null &
  else
    timeout -k "$KILL_GRACE_SECONDS" $((CLIP_SECONDS + 45)) ffmpeg -nostdin -hide_banner -loglevel error -y \
      -hwaccel cuda -hwaccel_output_format cuda \
      -rtsp_transport tcp -i "rtsp://127.0.0.1:8554/${STREAM_PATH}" \
      -t "$CLIP_SECONDS" -map 0:v:0 -an -vf "scale_cuda=-2:480" \
      -c:v h264_nvenc -preset p4 -rc vbr -cq 30 -b:v 600k \
      -maxrate 800k -bufsize 1200k -g 48 -keyint_min 24 -no-scenecut 1 \
      -movflags +faststart "$CLIP_FILE" 2>/dev/null &
  fi
  CLIP_PID=$!
  # `wait` on a specific pid returns that child's status, so the caller still
  # sees success or failure exactly as it did when this ran in the foreground.
  wait "$CLIP_PID"
  CLIP_STATUS=$?
  CLIP_PID=""
  return "$CLIP_STATUS"
}

validate_clip() {
  [ -s "$CLIP_FILE" ] || return 1
  CODEC=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name \
    -of default=noprint_wrappers=1:nokey=1 "$CLIP_FILE" 2>/dev/null | head -n 1)
  HEIGHT=$(ffprobe -v error -select_streams v:0 -show_entries stream=height \
    -of default=noprint_wrappers=1:nokey=1 "$CLIP_FILE" 2>/dev/null | head -n 1)
  DURATION=$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$CLIP_FILE" 2>/dev/null | head -n 1)
  SIZE_BYTES=$(wc -c < "$CLIP_FILE" | tr -d ' ')
  [ "$CODEC" = "h264" ] || return 1
  [ -n "$HEIGHT" ] && [ "$HEIGHT" -le 480 ] || return 1
  [ -n "$SIZE_BYTES" ] && [ "$SIZE_BYTES" -ge 50000 ] || return 1
  MIN_DURATION=$((CLIP_SECONDS > 15 ? CLIP_SECONDS - 10 : 5))
  awk -v duration="$DURATION" -v minimum="$MIN_DURATION" \
    'BEGIN { exit !(duration + 0 >= minimum + 0) }'
}

publish_clip() {
  GENERATION=$(date -u +%s)
  OBJECT_PATH="cameras/${CAMERA_ID}/${GENERATION}.mp4"
  SIZE_BYTES=$(wc -c < "$CLIP_FILE" | tr -d ' ')
  DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$CLIP_FILE" 2>/dev/null | cut -d. -f1)
  CAPTURED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  [ -z "${STABLE_AT:-}" ] && STABLE_AT="$CAPTURED_AT"

  UPLOAD_STATUS=$(curl -s -S -o /dev/null -w "%{http_code}" --max-time 180 \
    -X POST \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: video/mp4" \
    -H "Cache-Control: public, max-age=31536000, immutable" \
    --data-binary "@${CLIP_FILE}" \
    "${SUPABASE_INTERNAL_URL}/storage/v1/object/${BUCKET}/${OBJECT_PATH}" 2>/dev/null || true)
  case "$UPLOAD_STATUS" in 200|201) ;; *) return 1 ;; esac

  PAYLOAD="{\"camera_id\":\"${CAMERA_ID}\",\"storage_path\":\"${OBJECT_PATH}\",\"captured_at\":\"${CAPTURED_AT}\",\"source_stable_at\":\"${STABLE_AT}\",\"duration_seconds\":${DURATION:-0},\"size_bytes\":${SIZE_BYTES:-0},\"generation\":${GENERATION},\"last_attempt_at\":\"${CAPTURED_AT}\",\"last_attempt_status\":\"ready\",\"last_error_code\":null,\"updated_at\":\"${CAPTURED_AT}\"}"
  META_STATUS=$(curl -s -S -o /dev/null -w "%{http_code}" --max-time 20 \
    -X POST \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=minimal" \
    --data "$PAYLOAD" \
    "${SUPABASE_INTERNAL_URL}/rest/v1/tank_camera_clips?on_conflict=camera_id" 2>/dev/null || true)
  case "$META_STATUS" in 200|201|204) ;; *) return 1 ;; esac

  if [ -n "${PREVIOUS_PATH:-}" ] && [ "$PREVIOUS_PATH" != "$OBJECT_PATH" ]; then
    curl -s -S -o /dev/null --max-time 20 \
      -X DELETE \
      -H "apikey: ${SUPABASE_SERVICE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      --data "{\"prefixes\":[\"${PREVIOUS_PATH}\"]}" \
      "${SUPABASE_INTERNAL_URL}/storage/v1/object/${BUCKET}" 2>/dev/null || true
  fi
  return 0
}

# Spread worker startup slightly; the two-slot gate below remains the hard cap.
START_HASH=$(printf '%s' "$CAMERA_ID" | cksum | awk '{print $1}')
sleep $((START_HASH % 30))

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
  STABLE_AT=""
  if ! source_is_stable; then
    post_attempt "skipped_unstable" "source_not_stable"
    log "${CAMERA_ID}: source not stable; retrying in ${RETRY_SECONDS}s"
    sleep "$RETRY_SECONDS"
    continue
  fi

  acquire_slot
  PREVIOUS_PATH=$(previous_storage_path)
  post_attempt "capturing"
  if capture_clip && validate_clip && publish_clip; then
    log "${CAMERA_ID}: published a validated ${CLIP_SECONDS}s clip"
  else
    post_attempt "failed" "capture_validate_or_publish_failed"
    log "${CAMERA_ID}: clip refresh failed; previous validated clip preserved"
  fi
  rm -f "$CLIP_FILE" "$TELEMETRY_FILE" "$META_FILE" 2>/dev/null || true
  release_slot
  sleep "$REFRESH_SECONDS"
done
