import React, { type ComponentType, type ReactNode } from 'react'
import type { RenderAndRun } from './interactiveHelpers.js'

export type ReplRuntimeEngine = 'production' | 'local-preview'

export type LaunchReplOptions = {
  renderAndRun?: RenderAndRun
  engine?: ReplRuntimeEngine
  allowSelfRenderingApp?: boolean
}

type ProviderComponent<P = object> = ComponentType<
  P & { children?: ReactNode }
>

export type ReplLauncherReadiness = {
  connectedToBoot: boolean
  appSelfRenders: boolean
  safeToLaunch: boolean
  nextStep: string
}

export function getReplLauncherReadiness(): ReplLauncherReadiness {
  return {
    connectedToBoot: true,
    appSelfRenders: false,
    safeToLaunch: true,
    nextStep:
      'Next: extract smaller App frame/routes/state layers behind the launcher.',
  }
}

export async function launchRepl(options: LaunchReplOptions = {}): Promise<void> {
  const readiness = getReplLauncherReadiness()
  if (!readiness.safeToLaunch && !options.allowSelfRenderingApp) {
    throw new Error(getReplLauncherReadiness().nextStep)
  }

  const engine = resolveRuntimeEngine(options)

  if (engine === 'local-preview') {
    process.env.UNAXIS_LOCAL_INK_RUNTIME = '1'
  }

  const { App } = await import('./ink/App.js') as {
    App: ComponentType
  }
  const { AppProviders } = await import('./ink/AppProviders.js') as {
    AppProviders: ProviderComponent<{
      write?: (data: string) => void
    }>
  }
  const { setupGracefulShutdown } = await import('./utils/gracefulShutdown.js') as {
    setupGracefulShutdown: () => void
  }

  setupGracefulShutdown()

  const element = (
    <AppProviders write={data => {
      process.stdout.write(data)
    }}>
      <App />
    </AppProviders>
  )

  if (options.renderAndRun) {
    await options.renderAndRun(element)
    return
  }

  if (engine === 'local-preview') {
    const { renderSync } = await import('./ink/root.js')
    renderSync(element, {
      patchConsole: false,
      exitOnCtrlC: false,
    })
    return
  }

  const { renderAndRun } = await import('./interactiveHelpers.js') as {
    renderAndRun: RenderAndRun
  }
  await renderAndRun(element)
}

function resolveRuntimeEngine(options: LaunchReplOptions): ReplRuntimeEngine {
  if (options.engine) return options.engine
  return process.env.UNAXIS_LOCAL_INK_RUNTIME === '1' ||
    process.env.UNAXIS_LOCAL_INK_ENGINE === '1'
    ? 'local-preview'
    : 'production'
}
