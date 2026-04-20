/**
 * Detects if the current runtime is Bun.
 */
export function isRunningWithBun(): boolean {
  return (process as any).versions?.bun !== undefined
}

/**
 * Detects if running as a Bun-compiled standalone executable.
 */
export function isInBundledMode(): boolean {
  return (
    typeof (globalThis as any).Bun !== 'undefined' &&
    Array.isArray((globalThis as any).Bun.embeddedFiles) &&
    (globalThis as any).Bun.embeddedFiles.length > 0
  )
}
