# tui/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# Bun runtime + Docker CLI + Compose plugin.
# The ink container mounts the project at /app and /var/run/docker.sock so it
# can run docker/docker compose commands against the host Docker daemon.
#
# Source lives in tui/ (not ink/) to avoid Bun resolving the "ink" npm package
# import to the local ./ink directory -- which breaks { Box, Text } imports.
# ─────────────────────────────────────────────────────────────────────────────

FROM oven/bun:1.2

# Install Docker CLI
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      docker.io \
    && rm -rf /var/lib/apt/lists/*

# Install Docker Compose v2 plugin
RUN ARCH=$(dpkg --print-architecture | sed 's/amd64/x86_64/;s/arm64/aarch64/') && \
    mkdir -p /usr/local/lib/docker/cli-plugins && \
    curl -fsSL \
      "https://github.com/docker/compose/releases/download/v2.27.1/docker-compose-linux-${ARCH}" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose && \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

WORKDIR /app
