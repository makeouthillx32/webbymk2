// src/ink/logger.ts
// ─────────────────────────────────────────────────────────────────────────────
// Structured NDJSON logger for the TUI process.
//
// Output: PROJECT_DIR/logs/tui-YYYY-MM-DD.ndjson
//   - One JSON object per line.
//   - Daily rotation — each day gets its own file.
//   - Never throws — all I/O is wrapped; a logging failure must not kill the TUI.
//
// Levels:
//   info   — normal lifecycle events (build started, push complete, etc.)
//   warn   — recoverable oddities (token missing, fallback used)
//   error  — failures (build failed, push denied, token null)
//   debug  — verbose detail (credential resolution steps)
//   docker — raw lines from docker build / push / pull stdout+stderr
//
// Filtering from bash (jq):
//   # All non-docker events:
//   jq 'select(.level != "docker")' logs/tui-*.ndjson
//
//   # All errors:
//   jq 'select(.level == "error")' logs/tui-*.ndjson
//
//   # Build timeline for one zone:
//   jq 'select(.zone == "blog" and (.op | startswith("build")))' logs/tui-*.ndjson
//
//   # Token resolution trace:
//   jq 'select(.op == "ghcr-token")' logs/tui-*.ndjson
//
//   # Live tail (bash):
//   tail -f logs/tui-$(date +%F).ndjson | jq .
// ─────────────────────────────────────────────────────────────────────────────

import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join }                                  from "path";
import { PROJECT_DIR }                           from "../config/zones.ts";

// ── Internals ─────────────────────────────────────────────────────────────────

type Level = "info" | "warn" | "error" | "debug" | "docker";

const logDir = join(PROJECT_DIR, "logs");

function today(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function write(record: Record<string, unknown>): void {
  try {
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    appendFileSync(
      join(logDir, `tui-${today()}.ndjson`),
      JSON.stringify(record) + "\n",
      "utf8",
    );
  } catch {
    // Logging must never crash the TUI.
  }
}

function base(
  level:  Level,
  op:     string,
  msg:    string,
  extra?: Record<string, unknown>,
): void {
  write({ ts: new Date().toISOString(), level, op, msg, ...extra });
}

// ── Public API ────────────────────────────────────────────────────────────────

export const log = {
  /** Normal lifecycle event. */
  info(op: string, msg: string, extra?: Record<string, unknown>): void {
    base("info", op, msg, extra);
  },

  /** Recoverable oddity — something unexpected but handled. */
  warn(op: string, msg: string, extra?: Record<string, unknown>): void {
    base("warn", op, msg, extra);
  },

  /** Failure — operation did not complete successfully. */
  error(op: string, msg: string, extra?: Record<string, unknown>): void {
    base("error", op, msg, extra);
  },

  /** Verbose step-by-step detail (credential resolution, etc.). */
  debug(op: string, msg: string, extra?: Record<string, unknown>): void {
    base("debug", op, msg, extra);
  },

  /**
   * One raw line from a docker build/push/pull/logs stream.
   * Noisy but essential — filter with: jq 'select(.level != "docker")'
   */
  docker(
    zone:  string,
    phase: "build" | "push" | "deploy" | "dev" | "stop",
    line:  string,
  ): void {
    write({
      ts:    new Date().toISOString(),
      level: "docker",
      op:    `zone-${phase}`,
      zone,
      line,
    });
  },
};
