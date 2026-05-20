import React, { type ComponentType, type ReactNode } from 'react'
import type { RenderAndRun } from './interactiveHelpers.js'

/**
 * Unaxis runtime assembly layer.
 *
 * Target flow:
 *   cli.tsx -> main.tsx -> replLauncher.tsx -> interactiveHelpers.tsx -> src/ink.ts -> src/ink/App.tsx
 *
 * This layer assembles the current runtime tree. Terminal mounting belongs to
 * interactiveHelpers.tsx so App.tsx can keep shrinking without owning process
 * lifecycle concerns.
 */

export type LaunchReplOptions = {
  /**
   * Optional test seam for rendering the assembled tree without touching the
   * terminal. Production uses Ink's render().
   */
  renderAndRun?: RenderAndRun
}

type ProviderComponent<P = object> = ComponentType<
  P & { children?: ReactNode }
>

export async function launchRepl(options: LaunchReplOptions = {}): Promise<void> {
  const { App } = await import('./ink/App.tsx') as {
    App: ComponentType
  }
  const { NotificationsProvider } = await import('./ink/components/Notifications.tsx') as {
    NotificationsProvider: ProviderComponent
  }
  const { KeybindingWire } = await import('./ink/KeybindingWire.tsx') as {
    KeybindingWire: ProviderComponent
  }
  const { TerminalWriteProvider } = await import('./ink/useTerminalNotification.ts') as {
    TerminalWriteProvider: ProviderComponent<{
      value: typeof process.stdout.write
    }>
  }
  const { renderAndRun } = await import('./interactiveHelpers.tsx') as {
    renderAndRun: RenderAndRun
  }

  const element = (
    <TerminalWriteProvider value={process.stdout.write.bind(process.stdout)}>
      <KeybindingWire>
        <NotificationsProvider>
          <App />
        </NotificationsProvider>
      </KeybindingWire>
    </TerminalWriteProvider>
  )

  if (options.renderAndRun) {
    await options.renderAndRun(element)
    return
  }

  await renderAndRun(element)
}
