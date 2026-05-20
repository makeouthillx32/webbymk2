/**
 * interactiveHelpers.tsx - runtime lifecycle coordination layer.
 *
 * Sits between the runtime assembly layer (replLauncher.tsx) and the render
 * layer (src/ink.ts -> src/ink/). Owns terminal mounting plus the non-Ink
 * lifecycle around it: startup sequencing, deferred work, shutdown.
 *
 * Does NOT own:
 *   - onboarding / dialog logic (belongs in screens)
 *   - panel/view logic (belongs in src/ink/views/)
 *   - React state (belongs in hooks)
 *
 * NOTE: Do not import React hooks here. This file runs at the process level,
 * outside the src/ink/ React tree.
 */

import type { ReactNode }          from 'react'
import { startDeferredPrefetches } from './bootstrap/prefetch.js'
import { profileCheckpoint }       from './utils/startupProfiler.js'
import { getRuntime }              from './bootstrap/state.js'
import { setupGracefulShutdown }   from './utils/gracefulShutdown.js'

export type RenderAndRun = (element: ReactNode) => void | Promise<void>
type InkRender = (
  element: ReactNode,
  options: { patchConsole: boolean; exitOnCtrlC: boolean },
) => unknown | Promise<unknown>

/**
 * Mounts the assembled Unaxis runtime tree into the terminal.
 *
 * replLauncher.tsx owns which providers/screens are assembled. This helper owns
 * how that assembled tree is attached to Ink and the process lifecycle around
 * that mount.
 */
export async function renderAndRun(element: ReactNode): Promise<void> {
  const { render } = await import('./ink.js') as { render: InkRender }

  setupGracefulShutdown()

  await render(element, {
    patchConsole: false,
    exitOnCtrlC: false,
  })
}

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
