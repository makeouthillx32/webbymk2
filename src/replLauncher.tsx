import React, { type ComponentType, type ReactNode } from 'react'

export type LaunchReplOptions = {
  allowSelfRenderingApp?: boolean
}

type ProviderComponent<P = object> = ComponentType<
  P & { children?: ReactNode }
>

export async function launchRepl(options: LaunchReplOptions = {}): Promise<void> {
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
  const { ThemeProvider } = await import('./ink/components/design-system/ThemeProvider.js')
  const { renderSync } = await import('./ink/root.js')

  setupGracefulShutdown()

  const element = (
    <ThemeProvider initialState="dark" enableAutoTheme={false}>
      <AppProviders write={data => process.stdout.write(data)}>
        <App />
      </AppProviders>
    </ThemeProvider>
  )

  const instance = renderSync(element, {
    patchConsole: false,
    exitOnCtrlC: false,
  })

  // Wait for the process to be told to exit (Ctrl-C, unaxis exit, etc.)
  // renderSync returns an Instance whose waitUntilExit() resolves on unmount.
  // The graceful shutdown wired above will call unmount() at the right time.
  await instance.waitUntilExit()
}
