# packages/agent-updater/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# UNAXIS Agent Updater — minimal Docker-in-Docker helper.
#
# This image is launched by the UNAXIS Agent when a self-update is requested.
# It runs as a one-shot container (--rm / AutoRemove) in its own cgroup,
# completely independent of the agent container it is replacing.
#
# The updater inspects the live container's config (ports, volumes, group-adds,
# restart policy) and recreates it identically on the new image — no hardcoded
# flags, no config drift.
#
# Build:
#   docker build -t ghcr.io/makeouthillx32/unaxis-updater:v0 .
#
# Launched automatically by the agent. Manual use:
#   docker run --rm \
#     -v /var/run/docker.sock:/var/run/docker.sock \
#     ghcr.io/makeouthillx32/unaxis-updater:v0 \
#     unaxis_agent ghcr.io/makeouthillx32/unaxis-agent:v0
# ─────────────────────────────────────────────────────────────────────────────

FROM alpine:3.20

# Docker CLI is all we need — no daemon, no compose, no overhead.
RUN apk add --no-cache docker-cli

COPY updater.sh /usr/local/bin/updater.sh
RUN chmod +x /usr/local/bin/updater.sh

# Default arg: container name. Second arg (image ref) must be supplied by caller.
ENTRYPOINT ["/usr/local/bin/updater.sh"]
CMD ["unaxis_agent"]
