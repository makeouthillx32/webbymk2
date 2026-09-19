#!/bin/sh
# Aggregates completed past days' segments into a single 24-hour master MP4.
# Runs INSIDE unt_mediamtx where ffmpeg, ffprobe, and /archive are mounted.
set -u

API="${TANK_ARCHIVE_AGGREGATE_URL:-http://unt_tank:3000/api/tank/archive/aggregate}"
SECRET="${TANK_ARCHIVE_INGEST_SECRET:-}"
ROOT="${TANK_ARCHIVE_LOCAL_ROOT:-/archive}"
INTERVAL="${TANK_ARCHIVE_AGGREGATE_INTERVAL:-1800}"

log() { echo "[aggregate] $*"; }

if [ -z "$SECRET" ]; then
  log "TANK_ARCHIVE_INGEST_SECRET unset — aggregator idle"
  while true; do sleep 3600; done
fi

mkdir -p "${ROOT}/daily"

aggregate_day() {
  ROOM="$1"; DATE="$2"; CAM_ID="$3"; SEASON="$4"
  log "checking ${ROOM} for date ${DATE} (camera ${CAM_ID}, season ${SEASON})"

  SEGMENTS_DIR="${ROOT}/segments/${CAM_ID}/${DATE}"
  if [ ! -d "$SEGMENTS_DIR" ]; then
    log "segments directory not found: $SEGMENTS_DIR"
    return 1
  fi

  CONCAT_LIST="${ROOT}/daily/concat_${CAM_ID}_${DATE}.txt"
  MASTER_NAME="${SEASON}_${ROOM}_${DATE}.mp4"
  MASTER_PATH="${ROOT}/daily/${MASTER_NAME}"
  TMP_MASTER="${ROOT}/daily/${MASTER_NAME}.tmp.mp4"
  REL_PATH="daily/${MASTER_NAME}"

  # Build concat list sorted by filename/timestamp
  find "$SEGMENTS_DIR" -name "*.mp4" -type f | sort | sed "s/^/file '/;s/$/'/" > "$CONCAT_LIST"
  COUNT=$(wc -l < "$CONCAT_LIST" | tr -d ' ')

  if [ "$COUNT" -eq 0 ]; then
    log "no segments found for ${ROOM} ${DATE}"
    rm -f "$CONCAT_LIST"
    return 1
  fi

  log "concatenating ${COUNT} segments into ${MASTER_NAME}..."
  if ! ffmpeg -nostdin -hide_banner -loglevel warning -y \
      -f concat -safe 0 -i "$CONCAT_LIST" \
      -c copy -movflags +faststart "$TMP_MASTER" 2>/dev/null; then
    log "ffmpeg concat failed for ${ROOM} ${DATE}"
    rm -f "$CONCAT_LIST" "$TMP_MASTER"
    return 1
  fi

  rm -f "$CONCAT_LIST"

  SIZE=$(wc -c < "$TMP_MASTER" 2>/dev/null | tr -d ' ')
  if [ -z "$SIZE" ] || [ "$SIZE" -lt 10000 ]; then
    log "output too small (${SIZE:-0}B), aborting"
    rm -f "$TMP_MASTER"
    return 1
  fi

  mv "$TMP_MASTER" "$MASTER_PATH" || { log "failed to move to final master"; return 1; }

  DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$MASTER_PATH" 2>/dev/null | cut -d. -f1)
  DURATION=${DURATION:-0}

  log "master created: ${MASTER_NAME} (${SIZE}B, ${DURATION}s) — reporting to Tank API"

  PAYLOAD="{\"roomSlug\":\"${ROOM}\",\"recordedDate\":\"${DATE}\",\"seasonSlug\":\"${SEASON}\",\"storagePath\":\"${REL_PATH}\",\"fileSizeBytes\":${SIZE},\"durationSeconds\":${DURATION},\"segmentCount\":${COUNT}}"

  if curl -s -S -o /dev/null -w "%{http_code}" --max-time 60 \
      -X POST -H "Content-Type: application/json" \
      -H "x-tank-ingest-secret: ${SECRET}" \
      --data "$PAYLOAD" \
      "$API" 2>/dev/null | grep -q "^200$"; then
    log "successfully registered 24h master for ${ROOM} ${DATE}"
    return 0
  fi

  log "failed to register in Tank API"
  return 1
}

log "aggregator started (interval=${INTERVAL}s, root=${ROOT})"
while true; do
  BODY=$(curl -s -S --max-time 30 -H "x-tank-ingest-secret: ${SECRET}" "$API" 2>/dev/null)

  # Extracts roomSlug, recordedDate, cameraId, seasonSlug from JSON array
  echo "$BODY" \
    | tr '{' '\n' \
    | sed -n 's/.*"roomSlug":"\([^"]*\)".*"recordedDate":"\([^"]*\)".*"seasonSlug":"\([^"]*\)".*"cameraId":"\([^"]*\)".*/\1 \2 \4 \3/p' \
    | while read -r ROOM DATE CAM SEASON; do
        [ -n "$ROOM" ] && [ -n "$DATE" ] && [ -n "$CAM" ] && aggregate_day "$ROOM" "$DATE" "$CAM" "${SEASON:-s01}"
      done

  sleep "$INTERVAL"
done
