// src/ink/utils/dockerEnv.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared Docker process environment.
//
// Spreads process.env and, on non-Windows hosts, injects the standard
// DOCKER_HOST unix socket so Docker CLI commands resolve correctly.
// Import this instead of redeclaring DOCKER_ENV in each file.
// ─────────────────────────────────────────────────────────────────────────────

export const DOCKER_ENV: Record<string, string> = {
  ...(process.env as Record<string, string>),
  ...(process.platform !== "win32"
    ? { DOCKER_HOST: "unix:///var/run/docker.sock" }
    : {}),
};
