// src/utils/log.ts
// ─────────────────────────────────────────────────────────────────────────────
// Convenience error logger — thin wrapper over the structured logger in
// debug.ts.  All MCP and telemetry stubs have been removed.
//
// Use these for unhandled errors and runtime failures.
// Use `logger` from debug.ts for structured, leveled logging.
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from "./debug";

/**
 * Log a caught error.  Always persisted (errors are level 0).
 * Stack trace is included when available.
 */
export function logError(error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error(err.message, {
    stack: err.stack,
  });
}

/**
 * Log a warning-level message.
 */
export function logWarning(message: string, data?: Record<string, unknown>): void {
  logger.warn(message, data);
}
