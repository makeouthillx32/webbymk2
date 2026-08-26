#!/bin/sh
# Fired by MediaMTX (runOnRecordSegmentComplete) the moment a recording segment
# closes. Runs INSIDE unt_mediamtx — the only container in the stack carrying
# ffmpeg — with BusyBox sh, plus curl added by mediamtx/Dockerfile.
#
# Uploads MUST use curl, never BusyBox wget. wget --post-file transmits only the
# leading text bytes of a binary file (measured: a 100,000-byte MP4 arrived as
# Content-Length 116), and Supabase Storage then returns 200 having written a
# 0-byte object — so the upload "succeeds", the segment gets indexed, and the
# footage does not exist. BusyBox nc is no better. curl with --data-binary sends
# an exact Content-Length and reports a real status code.
#
# Three jobs, in order of how much it matters if they fail:
#   1. Upload the finished segment to Supabase Storage (the 24h hot archive)
#   2. Refresh this camera's preroll loop (the poster shown instead of black)
#   3. Tell Tank the segment exists so it lands in tank_archive_segments
#
# MediaMTX passes:
#   $MTX_SEGMENT_PATH  absolute path of the segment that just closed
#   $MTX_PATH          the stream path, e.g. cameras/cam-123-archive
#
# Failure policy: never exit non-zero on an upload problem. MediaMTX logs a
# failing hook but keeps recording either way, and the local spool still holds
# the file until recordDeleteAfter expires it — so a transient Supabase blip
# costs one segment, not the recording.

set -u

SEGMENT="${MTX_SEGMENT_PATH:-}"
STREAM_PATH="${MTX_PATH:-}"
PREROLL_SECONDS="${TANK_PREROLL_SECONDS:-120}"

log() { echo "[archive-hook] $*"; }

# Streams a file to Supabase Storage. Echoes the HTTP status so the caller can
# distinguish a real success from a 200 that stored nothing.
#   $1 file  $2 content-type  $3 url
upload_object() {
  curl -s -S -o /dev/null -w "%{http_code}" --max-time 600 \
    -X POST \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: ${2}" \
    -H "x-upsert: true" \
    --data-binary "@${1}" \
    "${3}" 2>/dev/null
}

ok_status() {
  [ "$1" = "200" ] || [ "$1" = "201" ]
}

if [ -z "$SEGMENT" ] || [ ! -f "$SEGMENT" ]; then
  log "no segment file at '${SEGMENT}' — nothing to do"
  exit 0
fi

# Storage credentials are needed only for the preroll loop now; the archive
# itself is a local move, so a missing key must not stop it.
STORAGE_READY=1
if [ -z "${SUPABASE_INTERNAL_URL:-}" ] || [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
  log "storage not configured — archiving locally, preroll refresh skipped"
  STORAGE_READY=0
fi

# cameras/cam-123-archive -> cam-123
CAMERA_ID=$(echo "$STREAM_PATH" | sed 's#^cameras/##; s#-archive$##')
if [ -z "$CAMERA_ID" ]; then
  log "could not derive a camera id from path '${STREAM_PATH}'"
  exit 0
fi

BASENAME=$(basename "$SEGMENT")
DATE_DIR=$(date -u +%Y-%m-%d)
OBJECT_PATH="segments/${CAMERA_ID}/${DATE_DIR}/${BASENAME}"

SIZE_BYTES=$(wc -c < "$SEGMENT" 2>/dev/null | tr -d ' ')
[ -z "$SIZE_BYTES" ] && SIZE_BYTES=0

# ffprobe is authoritative for duration — the filename carries only a start
# stamp, and a segment cut short by a camera dropping is shorter than the
# configured recordSegmentDuration.
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$SEGMENT" 2>/dev/null | cut -d. -f1)
[ -z "$DURATION" ] && DURATION=0

# ── 1. Move the segment onto the archive disk ──────────────────────────────
#
# MOVED, not uploaded. Sending segments into Supabase Storage put the archive
# inside Docker's virtual disk on C:, and that disk grows on every write and
# never shrinks on delete — a night of recording took the host to 5% free and
# killed the whole stack. The archive is the only thing here that grows without
# bound, so it is the one thing that must live on real storage.
#
# Both paths are on the same physical volume, so this is a rename: instant, no
# network, no second copy, and no way to half-succeed the way a 200-with-zero-
# bytes upload could.
ARCHIVE_ROOT="${TANK_ARCHIVE_LOCAL_ROOT:-/archive}"
DEST_DIR="${ARCHIVE_ROOT}/segments/${CAMERA_ID}/${DATE_DIR}"
DEST="${DEST_DIR}/${BASENAME}"

STORED=0
if mkdir -p "$DEST_DIR" 2>/dev/null && mv "$SEGMENT" "$DEST" 2>/dev/null; then
  # Confirm the bytes actually landed before anything is indexed. A segment
  # indexed but absent is a broken player; absent but unindexed is merely lost.
  MOVED_BYTES=$(wc -c < "$DEST" 2>/dev/null | tr -d ' ')
  if [ "${MOVED_BYTES:-0}" = "$SIZE_BYTES" ] && [ "${SIZE_BYTES:-0}" -gt 0 ]; then
    log "archived ${DEST} (${SIZE_BYTES} bytes, ${DURATION}s)"
    STORED=1
    SEGMENT="$DEST"   # later steps read the file from its new home
  else
    log "SIZE MISMATCH after move (${MOVED_BYTES:-0} != ${SIZE_BYTES}) for ${BASENAME}"
  fi
else
  log "ARCHIVE MOVE FAILED for ${BASENAME} — segment stays in the spool"
fi

# ── 2. Refresh the preroll loop ─────────────────────────────────────────────
# Cut from the segment already on local disk rather than opening a second pull
# off the live camera — the receiver's video-out port should carry exactly one
# consumer, and this way the loop costs no extra network at all.
#
# Silent and faststart on purpose: it plays muted behind a connecting spinner,
# and moov-at-front lets the browser start it from the first bytes.
LOOP_TMP="/tmp/preroll-${CAMERA_ID}.mp4"
if [ "$STORAGE_READY" = "1" ] && ffmpeg -nostdin -hide_banner -loglevel error -y \
    -sseof "-${PREROLL_SECONDS}" -i "$SEGMENT" \
    -an -c:v libx264 -preset veryfast -crf 30 -vf "scale=-2:480" \
    -movflags +faststart -t "$PREROLL_SECONDS" \
    "$LOOP_TMP" 2>/dev/null && [ -s "$LOOP_TMP" ]; then
  LOOP_STATUS=$(upload_object "$LOOP_TMP" "video/mp4" \
    "${SUPABASE_INTERNAL_URL}/storage/v1/object/tank-loops/cameras/${CAMERA_ID}.mp4")
  if ok_status "$LOOP_STATUS"; then
    log "refreshed preroll loop for ${CAMERA_ID}"
  else
    log "preroll upload failed (HTTP ${LOOP_STATUS:-000}) for ${CAMERA_ID}"
  fi
else
  log "preroll encode failed for ${CAMERA_ID}"
fi
rm -f "$LOOP_TMP"

# Refresh a social-card still from the same finished segment. This is the
# durable fallback for a camera that is currently offline; while live, the
# 360p preview-rung hook replaces it every few seconds with a newer frame.
OG_TMP="/tmp/og-${CAMERA_ID}.jpg"
if [ "$STORAGE_READY" = "1" ] && ffmpeg -nostdin -hide_banner -loglevel error -y \
    -sseof -3 -i "$SEGMENT" -frames:v 1 \
    -vf "scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630" \
    -q:v 3 "$OG_TMP" 2>/dev/null && [ -s "$OG_TMP" ]; then
  OG_STATUS=$(upload_object "$OG_TMP" "image/jpeg" \
    "${SUPABASE_INTERNAL_URL}/storage/v1/object/tank-loops/cameras/${CAMERA_ID}.jpg")
  if ok_status "$OG_STATUS"; then
    log "refreshed share image for ${CAMERA_ID}"
  else
    log "share image upload failed (HTTP ${OG_STATUS:-000}) for ${CAMERA_ID}"
  fi
else
  log "share image encode failed for ${CAMERA_ID}"
fi
rm -f "$OG_TMP"

# ── 3. Index it ─────────────────────────────────────────────────────────────
# Only index what actually reached Supabase. An unindexed segment is invisible
# but recoverable; an indexed segment that isn't there is a broken player.
if [ "$STORED" = "1" ] && [ -n "${TANK_ARCHIVE_NOTIFY_URL:-}" ]; then
  START_ISO=$(date -u -r "$SEGMENT" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
  PAYLOAD="{\"cameraId\":\"${CAMERA_ID}\",\"storagePath\":\"${OBJECT_PATH}\",\"fileSizeBytes\":${SIZE_BYTES},\"durationSeconds\":${DURATION},\"segmentStart\":\"${START_ISO}\",\"fileName\":\"${BASENAME}\"}"

  NOTIFY_STATUS=$(curl -s -S -o /dev/null -w "%{http_code}" --max-time 60 \
    -X POST \
    -H "Content-Type: application/json" \
    -H "x-tank-ingest-secret: ${TANK_ARCHIVE_INGEST_SECRET:-}" \
    --data "$PAYLOAD" \
    "$TANK_ARCHIVE_NOTIFY_URL" 2>/dev/null)

  if [ "$NOTIFY_STATUS" = "200" ]; then
    log "indexed ${OBJECT_PATH}"
  else
    log "index notify failed (HTTP ${NOTIFY_STATUS:-000}) for ${OBJECT_PATH} — object is uploaded but unlisted"
  fi
fi

exit 0
