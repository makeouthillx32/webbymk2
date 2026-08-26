#!/bin/sh
# Re-encodes aged archive segments from H.264 to AV1.
#
# Runs INSIDE unt_mediamtx because that is the only container with ffmpeg and
# the GPU. It has no database access, so it asks Tank what to convert and
# reports back — same split as the recording hook.
#
# Why AV1 only after the browsable window: measured here, av1_nvenc hits the
# same quality as h264_nvenc at ~40% of the bitrate, but Safari can only decode
# AV1 on newer hardware. Recent footage therefore stays H.264 so it plays for
# everyone; older footage trades reach for space.
#
# Ordering rule: the row is marked av1 ONLY after the new file is in place and
# verified. A row that claims av1 while an H.264 file sits on disk is harmless;
# the reverse hands an unplayable file to every older device with no warning,
# because the warning is driven by that column.
set -u

API="${TANK_ARCHIVE_TRANSCODE_URL:-http://unt_tank:3000/api/tank/archive/transcode}"
SECRET="${TANK_ARCHIVE_INGEST_SECRET:-}"
ROOT="${TANK_ARCHIVE_LOCAL_ROOT:-/archive}"
BATCH="${TANK_ARCHIVE_TRANSCODE_BATCH:-3}"
INTERVAL="${TANK_ARCHIVE_TRANSCODE_INTERVAL:-900}"

log() { echo "[av1] $*"; }

if [ -z "$SECRET" ]; then
  log "TANK_ARCHIVE_INGEST_SECRET unset — converter idle"
  while true; do sleep 3600; done
fi

convert_one() {
  ID="$1"; REL="$2"
  SRC="${ROOT}/${REL}"
  TMP="${SRC}.av1.tmp.mp4"

  [ -f "$SRC" ] || { log "missing on disk: $REL"; return 1; }

  # Decode and encode both on the GPU. Software AV1 (libaom/SVT) is far slower
  # than x264 and would take longer than the interval for a single segment.
  if ! ffmpeg -nostdin -hide_banner -loglevel error -y \
      -hwaccel cuda -hwaccel_output_format cuda -i "$SRC" \
      -c:v av1_nvenc -preset p4 -rc vbr -cq 32 \
      -c:a copy -movflags +faststart "$TMP" 2>/dev/null; then
    log "encode failed: $REL"
    rm -f "$TMP"
    return 1
  fi

  NEW=$(wc -c < "$TMP" 2>/dev/null | tr -d ' ')
  OLD=$(wc -c < "$SRC" 2>/dev/null | tr -d ' ')
  # A suspiciously tiny output means a truncated encode. Keep the original.
  if [ -z "$NEW" ] || [ "$NEW" -lt 10000 ]; then
    log "output too small (${NEW:-0}B), keeping h264: $REL"
    rm -f "$TMP"
    return 1
  fi

  # Replace in place, then index. If the process dies between these two, the
  # file is AV1 while the row still says h264 — the safe direction: players
  # that can decode it still work, and the next pass re-converts idempotently.
  mv "$TMP" "$SRC" || { log "replace failed: $REL"; rm -f "$TMP"; return 1; }

  if curl -s -S -o /dev/null -w "%{http_code}" --max-time 60 \
      -X POST -H "Content-Type: application/json" \
      -H "x-tank-ingest-secret: ${SECRET}" \
      --data "{\"id\":\"${ID}\",\"fileSizeBytes\":${NEW}}" \
      "$API" 2>/dev/null | grep -q "^200$"; then
    log "converted ${REL}: ${OLD}B -> ${NEW}B"
    return 0
  fi
  log "converted but index failed: $REL"
  return 1
}

log "converter started (batch=${BATCH}, interval=${INTERVAL}s, root=${ROOT})"
while true; do
  BODY=$(curl -s -S --max-time 60 -H "x-tank-ingest-secret: ${SECRET}" \
    "${API}?limit=${BATCH}" 2>/dev/null)

  # id and storagePath, one pair per line. Plain sed rather than a JSON parser
  # because BusyBox has no jq and the shape here is ours and fixed.
  echo "$BODY" \
    | tr '{' '\n' \
    | sed -n 's/.*"id":"\([^"]*\)".*"storagePath":"\([^"]*\)".*/\1 \2/p' \
    | while read -r ID REL; do
        [ -n "$ID" ] && [ -n "$REL" ] && convert_one "$ID" "$REL"
      done

  sleep "$INTERVAL"
done
