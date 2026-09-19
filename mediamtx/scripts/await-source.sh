#!/bin/sh
# Wait for a MediaMTX path to actually carry a stream, then exec a command.
#
# WHY THIS EXISTS
# ---------------
# runOnInit fires when a path is CREATED, not when its source is PUBLISHING.
# Every dependent stage (-hls, -hls-low, -archive) therefore started before the
# stream it reads existed, got "404 Not Found" from RTSP, and exited within
# milliseconds. runOnInitRestart then restarted it immediately, so the failure
# became a tight respawn loop rather than a single miss.
#
# Measured during the 2026-09-15 incident: MediaMTX swinging between 150% and
# 865% CPU while cameras flickered 6/6 -> 0/6, with the logs filled by
#   Error opening input file rtsp://127.0.0.1:8554/cameras/<id>-hls-low
#   [path cameras/<id>-archive] runOnInit command exited: code 0
#
# Waiting costs nothing: a stage that starts late simply starts late. Racing
# costs the whole pipeline, because the respawn storm starves the very source
# these stages are waiting for.
#
# Usage: await-source.sh <path-to-wait-for> <command> [args...]

set -u

WAIT_PATH="${1:-}"
[ -z "$WAIT_PATH" ] && { echo "[await-source] no path given" >&2; exit 64; }
shift

API="${MTX_API:-http://127.0.0.1:9997}"
# Generous by design. A camera can be down for minutes, and a dependent stage
# that gives up would need MediaMTX to restart it -- which is the loop this
# script exists to end. Zero means wait forever.
MAX_WAIT="${AWAIT_SOURCE_MAX_SECONDS:-0}"
POLL_START=1
POLL_MAX=10

log() { echo "[await-source] $*"; }

waited=0
delay="$POLL_START"

while :; do
  # `ready` is MediaMTX's own word for "a publisher is attached and sending".
  # Checking the API rather than probing RTSP avoids opening (and abandoning)
  # a real session on every attempt, which is itself load on the source.
  # curl only: this image ships /usr/bin/curl and has no wget, and a silent
  # fallback to a missing binary would make every stage wait forever.
  state=$(curl -sf --max-time 5 "${API}/v3/paths/get/$(echo "$WAIT_PATH" | sed 's#/#%2F#g')" 2>/dev/null || true)

  case "$state" in
    *'"ready":true'*)
      log "$WAIT_PATH ready after ${waited}s — starting"
      exec "$@"
      ;;
  esac

  if [ "$MAX_WAIT" -gt 0 ] && [ "$waited" -ge "$MAX_WAIT" ]; then
    log "$WAIT_PATH still not ready after ${waited}s — giving up"
    exit 75
  fi

  sleep "$delay"
  waited=$((waited + delay))
  # Back off to POLL_MAX and stay there, so a long outage costs a handful of
  # cheap API calls a minute instead of a spin.
  [ "$delay" -lt "$POLL_MAX" ] && delay=$((delay + 1))
done
