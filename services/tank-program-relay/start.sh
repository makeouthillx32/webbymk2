#!/bin/sh
# services/tank-program-relay/start.sh
#
# Boots the virtual display + virtual sound card Chromium needs to have
# something real to draw and to play audio into, then hands off to the node
# supervisor (src/index.mjs), which owns Chromium and ffmpeg from here on.
set -e

WIDTH="${RELAY_WIDTH:-1920}"
HEIGHT="${RELAY_HEIGHT:-1080}"

# A stale lock file from a previous crash/restart would make Xvfb refuse to
# bind :99 on the next boot.
rm -f /tmp/.X99-lock

Xvfb :99 -screen 0 "${WIDTH}x${HEIGHT}x24" -nolisten tcp &
XVFB_PID=$!

# Give Xvfb a moment to bind before anything tries to open a window on it.
for i in $(seq 1 20); do
  if xdpyinfo -display :99 >/dev/null 2>&1; then break; fi
  sleep 0.25
done

# A null sink gives Chromium a speaker that goes nowhere but ffmpeg's ears —
# `relay_sink.monitor` is what ffmpeg's `-f pulse` input reads.
pulseaudio -D --exit-idle-time=-1 --disallow-exit --log-target=stderr
for i in $(seq 1 20); do
  if pactl info >/dev/null 2>&1; then break; fi
  sleep 0.25
done
pactl load-module module-null-sink sink_name=relay_sink sink_properties=device.description=relay_sink
pactl set-default-sink relay_sink

cleanup() {
  kill "$XVFB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

exec node src/index.mjs
