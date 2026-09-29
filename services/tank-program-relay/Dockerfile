# services/tank-program-relay/Dockerfile
#
# Build context is this directory (unlike tank-vision-worker) — this service
# only ever fetches the Director programme over HTTP; it imports nothing from
# the app's src/ tree.
#
# Base image is Microsoft's own Playwright image: it ships a Chromium build
# already matched to the `playwright` version below plus every native lib
# Chromium needs, which is the fragile part of "run a real browser in Docker"
# to get right. ffmpeg/Xvfb/pulseaudio on top are the standard
# browser-to-RTMP bridge — see start.sh and src/index.mjs for why Chromium
# runs HEADED inside Xvfb rather than headless (headless draws nothing an
# x11grab can see).
FROM mcr.microsoft.com/playwright:v1.63.0-jammy

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ffmpeg xvfb pulseaudio dbus-x11 x11-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
# Browsers are already baked into this base image at the matching version —
# this only installs the `playwright` JS package itself, no browser download.
RUN npm install --omit=dev

COPY src ./src
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# PulseAudio refuses to run as root (by design — it assumes a real user
# session) — `pwuser` is the non-root account this image already ships for
# exactly this class of problem. XDG_RUNTIME_DIR is where PulseAudio's user
# daemon puts its socket by default; pulseaudio checks its permissions
# strictly (must be 0700, owned by the daemon's own user), hence the explicit
# mkdir/chown/chmod rather than leaving it to be created lazily.
RUN mkdir -p /tmp/runtime-pwuser /tmp/.X11-unix \
  && chown -R pwuser:pwuser /tmp/runtime-pwuser /app \
  && chmod 700 /tmp/runtime-pwuser \
  && chmod 1777 /tmp/.X11-unix

ENV DISPLAY=:99
ENV XDG_RUNTIME_DIR=/tmp/runtime-pwuser
ENV PULSE_SERVER=unix:/tmp/runtime-pwuser/pulse/native
ENV HOME=/home/pwuser

USER pwuser
CMD ["./start.sh"]
