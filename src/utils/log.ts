/**
 * Minimal logger shim for the TUI engine.
 */

export function logError(error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  // In standalone mode, we just log to stderr for now.
  // In production, this could write to a hidden debug file.
  if (process.env.DEBUG) {
    console.error(`[TUI ERROR] ${err.stack || err.message}`);
  }
}

export function logMCPError(serverName: string, error: unknown): void {
  if (process.env.DEBUG) {
    console.error(`[MCP ERROR] ${serverName}:`, error);
  }
}

export function logMCPDebug(serverName: string, message: string): void {
  if (process.env.DEBUG) {
    console.error(`[MCP DEBUG] ${serverName}: ${message}`);
  }
}

export function attachErrorLogSink(): void {
  // No-op for standalone
}
