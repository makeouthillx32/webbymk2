# Build context is the REPO ROOT, not this directory:
#   docker build -f services/tank-vision-worker/Dockerfile .
#
# The worker imports the decoder and the detection catalog from the app's own
# src/ tree by relative path, so that browser and server detection can never
# drift into disagreeing about what was in frame. That only works if the layout
# inside the image matches the layout in the repo — hence WORKDIR /repo and the
# two COPYs below preserving their original paths. Copying the shared files into
# the worker's own src/ instead would resolve, but it would also mean two files
# on disk and a fork waiting to happen.
FROM oven/bun:1.3.14-slim

WORKDIR /repo/services/tank-vision-worker

COPY services/tank-vision-worker/package.json services/tank-vision-worker/tsconfig.json ./
# The lockfile comes along so image builds resolve the same versions the repo
# was tested against. Plain `bun install` honours it when present without
# hard-failing on drift — NOT `--frozen-lockfile=false`, which bun 1.3.14
# rejects outright ("the argument does not take a value"); that flag is a latent
# break in tank-audio-worker's Dockerfile too.
COPY services/tank-vision-worker/bun.lock ./
RUN bun install

# ffmpeg decodes the HLS feeds; ffprobe (same package) reads their dimensions,
# which is what makes the letterbox exact rather than assumed.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY services/tank-vision-worker/src ./src

# Shared with the tank zone — single source of truth for decode + identity.
COPY src/zones/tank/vision /repo/src/zones/tank/vision
COPY src/zones/tank/server/detectionCatalog.ts /repo/src/zones/tank/server/detectionCatalog.ts

# The stock Ultralytics checkpoint, unmodified. Same file the browser serves.
COPY public/models/yolov8n.onnx ./models/yolov8n.onnx

ENV TANK_VISION_MODEL_PATH=./models/yolov8n.onnx

# OSNet-AIN re-id (the same model the graded gallery was built with), exported to
# ONNX by services/tank-vision-gpu. Names people from the operator's gallery on
# its own thread; see src/galleryNaming.ts.
COPY services/tank-vision-worker/models/osnet_ain_x1_0.onnx ./models/osnet_ain_x1_0.onnx
ENV TANK_VISION_REID_MODEL_PATH=./models/osnet_ain_x1_0.onnx

USER bun
CMD ["bun", "src/index.ts"]
