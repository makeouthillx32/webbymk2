import type { ReactNode } from 'react'
import { startDeferredPrefetches } from './bootstrap/prefetch.js'
import { getRuntime } from './bootstrap/state.js'
import { setupGracefulShutdown } from './utils/gracefulShutdown.js'
import { profileCheckpoint } from './utils/startupProfiler.js'

export type RenderAndRun = (element: ReactNode) => void | Promise<void>

export async function renderAndRun(element: ReactNode): Promise<void> {
  const { renderSync } = await import('./ink/root.js')

  setupGracefulShutdown()

  renderSync(element, {
    patchConsole: false,
    exitOnCtrlC: false,
  })
}

export function onFirstPaint(): void {
  profileCheckpoint('first-paint')
  startDeferredPrefetches()
}

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
