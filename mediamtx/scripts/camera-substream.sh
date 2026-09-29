#!/bin/sh
# Pulls a camera's own low-res sub-stream into cameras/<id>-sub. Video only,
# copied — never decoded. See "Camera sub-streams" in
# src/zones/tank/server/mediaGateway.ts for why this exists.
#
# usage: camera-substream.sh <publish-path> <sar|none> <rtsp-url>
#
# <sar> is stamped into the H.264 headers (still a copy): Dahua sub-streams
# squeeze the full 16:9 view into 704x480 with no aspect flag, so without it
# every player shows the picture stretched.
#
# A REJECTED LOGIN IS NEVER RETRIED QUICKLY. MediaMTX restarts this the moment
# it exits (runOnInitRestart), and Dahua locks the camera account after a few
# failed logins — the same account the SRT receiver's main bridge uses, so a
# lockout would take the camera's main feed down too. On a 401 this waits an
# hour before exiting, i.e. at most one failed login per hour.

set -u

OUT="$1"
SAR="$2"
URL="$3"

BSF="dump_extra"
[ "$SAR" != "none" ] && BSF="h264_metadata=sample_aspect_ratio=${SAR},dump_extra"

LOG="/tmp/substream-$(echo "$OUT" | tr '/' '_').log"

ffmpeg -nostdin -hide_banner -loglevel warning \
  -rtsp_transport tcp -timeout 5000000 -i "$URL" \
  -map 0:v:0 -an -c:v copy -bsf:v "$BSF" \
  -rtsp_transport tcp -f rtsp "rtsp://127.0.0.1:8554/${OUT}" 2> "$LOG"

# The URL carries the camera password; never let it reach MediaMTX's log.
tail -n 3 "$LOG" | sed 's#rtsp://[^@ ]*@#rtsp://***@#g' | sed "s#^#[camera-substream] ${OUT}: #"

if grep -q "401 Unauthorized" "$LOG"; then
  echo "[camera-substream] ${OUT}: camera rejected the login — not retrying for an hour"
  sleep 3600
else
  sleep 5
fi
exit 1
