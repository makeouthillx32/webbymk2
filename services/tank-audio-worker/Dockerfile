FROM oven/bun:1.3.14-slim

WORKDIR /worker
COPY package.json tsconfig.json ./
RUN bun install --frozen-lockfile=false
COPY src ./src

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg pulseaudio-utils pipewire-audio-client-libraries \
  && rm -rf /var/lib/apt/lists/*

USER bun
CMD ["bun", "src/index.ts"]
