/**
 * interactiveHelpers.tsx - runtime lifecycle coordination layer.
 *
 * Sits between the bootstrap (main.tsx) and the render layer (src/ink/).
 * Owns the non-Ink lifecycle: startup sequencing, deferred work, shutdown.
 *
 * Does NOT own:
 *   - onboarding / dialog logic (belongs in screens)
 *   - panel/view logic (belongs in src/ink/views/)
 *   - React state (belongs in hooks)
 *
 * NOTE: Do not import Ink or React hooks here. This file runs at the process
 * level, outside the src/ink/ React-18 isolation boundary. Any Ink component
 * rendering must be triggered through src/ink/App.tsx.
 */

import { startDeferredPrefetches } from './bootstrap/prefetch.js'
import { profileCheckpoint }       from './utils/startupProfiler.js'
import { getRuntime }              from './bootstrap/state.js'

/**
 * Called after first paint to kick off deferred startup work.
 * Safe to call multiple times (idempotent).
 */
export function onFirstPaint(): void {
  profileCheckpoint('first-paint')
  startDeferredPrefetches()
}

/**
 * Returns a summary of the current runtime context for display or logging.
 */
export function getRuntimeSummary(): string {
  try {
    const rt = getRuntime()
    const uptime = Date.now() - rt.startedAt
    return [
      `root: ${rt.projectRoot}`,
      `valid: ${rt.rootValid}`,
      `uptime: ${uptime}ms`,
    ].join('  |  ')
  } catch {
    return 'runtime not initialized'
  }
}
