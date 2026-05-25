import React, { type ComponentType, type ReactNode } from 'react'
import type { RenderAndRun } from './interactiveHelpers.js'

export type LaunchReplOptions = {
  renderAndRun?: RenderAndRun
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
    connectedToBoot: false,
    appSelfRenders: true,
    safeToLaunch: false,
    nextStep:
      'Extract the self-rendering bootstrap from src/ink/App.tsx before wiring launchRepl.',
  }
}

export async function launchRepl(options: LaunchReplOptions = {}): Promise<void> {
  if (!options.allowSelfRenderingApp) {
    throw new Error(getReplLauncherReadiness().nextStep)
  }

  const { App } = await import('./ink/App.js') as {
    App: ComponentType
  }
  const { NotificationsProvider } = await import('./ink/components/Notifications.js') as {
    NotificationsProvider: ProviderComponent
  }
  const { KeybindingWire } = await import('./ink/KeybindingWire.js') as {
    KeybindingWire: ProviderComponent
  }
  const { TerminalSizeProvider } = await import('./ink/components/TerminalSizeContext.js') as {
    TerminalSizeProvider: ProviderComponent
  }
  const { TerminalWriteProvider } = await import('./ink/useTerminalNotification.js') as {
    TerminalWriteProvider: ProviderComponent<{
      value: typeof process.stdout.write
    }>
  }
  const { renderAndRun } = await import('./interactiveHelpers.js') as {
    renderAndRun: RenderAndRun
  }

  const element = (
    <TerminalWriteProvider value={process.stdout.write.bind(process.stdout)}>
      <TerminalSizeProvider>
        <KeybindingWire>
          <NotificationsProvider>
            <App />
          </NotificationsProvider>
        </KeybindingWire>
      </TerminalSizeProvider>
    </TerminalWriteProvider>
  )

  if (options.renderAndRun) {
    await options.renderAndRun(element)
    return
  }

  await renderAndRun(element)
}
