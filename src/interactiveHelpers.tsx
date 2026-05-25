import type { ReactNode } from 'react'
import { startDeferredPrefetches } from './bootstrap/prefetch.js'
import { getRuntime } from './bootstrap/state.js'
import { setupGracefulShutdown } from './utils/gracefulShutdown.js'
import { profileCheckpoint } from './utils/startupProfiler.js'

export type RenderAndRun = (element: ReactNode) => void | Promise<void>
type InkRender = (
  element: ReactNode,
  options: { patchConsole: boolean; exitOnCtrlC: boolean },
) => unknown | Promise<unknown>

export async function renderAndRun(element: ReactNode): Promise<void> {
  const { render } = await import('ink') as { render: InkRender }

  setupGracefulShutdown()

  await render(element, {
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
