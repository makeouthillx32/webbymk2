/**
 * Minimal debug utility for the TUI engine.
 */

export type DebugLogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error'

export function logForDebugging(
  message: string,
  { level }: { level: DebugLogLevel } = {
    level: 'debug',
  },
): void {
  if (!process.env.DEBUG) return;
  
  const timestamp = new Date().toISOString();
  console.error(`${timestamp} [${level.toUpperCase()}] ${message.trim()}`);
}

export function isDebugMode(): boolean {
  return !!process.env.DEBUG;
}

export function logAntError(context: string, error: unknown): void {
  // No-op for standalone
}

export function flushDebugLogs(): Promise<void> {
  return Promise.resolve();
}
