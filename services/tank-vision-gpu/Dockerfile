# The AI-mode learner: names live bodies for the director and collects sightings
# to grade. See tools/live_learner.py.
#
# Built from the REPO ROOT (like tank-vision-worker) so .dockerignore's
# services/** negations control exactly what ships. Weights, the graded gallery
# and the run state are bind-mounted rather than baked: the gallery changes every
# time the operator grades, and a rebuild to pick that up would be absurd.
FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

# ffmpeg reads the cameras over RTSP; curl talks to PostgREST, Storage and Tank.
# libgl/libglib are OpenCV's runtime dependencies.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# Pinned to what the host venv proved out (see tools/live_learner.py's history).
RUN pip install --no-cache-dir \
      ultralytics==8.4.154 \
      opencv-python-headless==4.11.0.86 \
      lap==0.5.12 \
      scikit-learn==1.5.2

WORKDIR /app
COPY services/tank-vision-gpu/tank_vision /app/tank_vision
COPY services/tank-vision-gpu/tools /app/tools

# DINOv2 arrives through torch.hub, which would otherwise download on every
# start; the cache is mounted at /root/.cache/torch.
ENV PYTHONUNBUFFERED=1 \
    TORCH_HOME=/root/.cache/torch \
    YOLO_CONFIG_DIR=/tmp/ultralytics

# --priority normal: the container's CPU share is set in compose, and a
# BELOW_NORMAL class inside Linux is not the same lever.
ENTRYPOINT ["python", "-u", "tools/live_learner.py", "--priority", "normal"]
