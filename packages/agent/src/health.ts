// packages/agent/src/health.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /health — reachability + version check.
//
// The TUI wizard pings this endpoint to:
//   1. Confirm the agent is reachable on the configured agent_url.
//   2. Read the version string to store in agent_version.
//   3. Update agent_status = 'online' + agent_last_seen_at = now() in Supabase.
//
// Response shape (stable contract — do not change without bumping version):
//   { "status": "online", "version": "0.1.0", "platform": "linux/amd64" }
// ─────────────────────────────────────────────────────────────────────────────

import { AGENT_VERSION } from "./version.ts";

const PLATFORM = `${process.platform}/${process.arch}`;

export function handleHealth(): Response {
  return Response.json({
    status:   "online",
    version:  AGENT_VERSION,
    platform: PLATFORM,
  });
}
