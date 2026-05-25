import React from 'react'
import type { ReactNode } from 'react'
import { renderSync, type RenderOptions, type Instance } from './root.js'
import { Box, Text } from './runtimeInk.js'
import { AlternateScreen } from './components/AlternateScreen.js'
import { AppShell } from './components/AppShell.js'
import {
  NotificationsProvider,
  type Notification,
} from './components/Notifications.js'
import { TerminalSizeProvider } from './components/TerminalSizeContext.js'
import { ThemeProvider } from './components/design-system/ThemeProvider.js'
import { TerminalWriteProvider } from './useTerminalNotification.js'
import { ZonesView } from './views/ZonesView.js'
import type { Zone } from '../config/zones.js'
import type { Status } from './docker.js'

const previewZones: Zone[] = [
  {
    key: 'unenter',
    label: 'Core App',
    domain: 'unenter.live',
    service: 'app',
    container: 'unt_app',
    image: 'ghcr.io/unaxis/core',
    dockerfile: 'Dockerfile',
    upstreamEnvKey: 'UPSTREAM_APP',
  },
  {
    key: 'demo',
    label: 'Demo Zone',
    domain: 'demo.local',
    service: 'demo',
    container: 'demo',
    image: 'ghcr.io/unaxis/demo',
    dockerfile: 'Dockerfile',
    upstreamEnvKey: 'UPSTREAM_DEMO',
  },
]

const previewStatuses: Record<string, Status> = {
  unenter: 'running',
  demo: 'running',
}

type LocalEnginePreviewRootProps = {
  children?: ReactNode
  notifications?: Notification[]
  terminalWrite?: (data: string) => void
}

export function LocalEnginePreviewRoot({
  children,
  notifications = [],
  terminalWrite = data => process.stdout.write(data),
}: LocalEnginePreviewRootProps): React.ReactNode {
  return (
    <TerminalWriteProvider value={terminalWrite}>
      <TerminalSizeProvider>
        <ThemeProvider initialState="dark" enableAutoTheme={false}>
          <NotificationsProvider>
            <AlternateScreen mouseTracking>
              <AppShell
                view="zones"
                history={['welcome', 'zones']}
                subCrumbs={['local-engine-preview']}
                bgOps={[]}
                stackOpen={false}
                stackFocused={false}
                stackFocusId={null}
                notifications={notifications}
                didCopy={false}
              >
                {children ?? (
                  <Box flexDirection="column">
                    <Text bold>Local engine preview</Text>
                    <ZonesView
                      zones={previewZones}
                      zoneStatuses={previewStatuses}
                      proxyStatus="running"
                      setZones={() => {}}
                      runOp={() => {}}
                      openLogs={() => {}}
                      addNotification={() => {}}
                      onGoBack={() => {}}
                      onNewZone={() => {}}
                      onSubCrumbs={() => {}}
                      isActive={false}
                    />
                  </Box>
                )}
              </AppShell>
            </AlternateScreen>
          </NotificationsProvider>
        </ThemeProvider>
      </TerminalSizeProvider>
    </TerminalWriteProvider>
  )
}

export function renderLocalEnginePreview(
  options?: RenderOptions,
): Instance {
  const stdout = options?.stdout ?? process.stdout
  return renderSync(<LocalEnginePreviewRoot terminalWrite={data => stdout.write(data)} />, {
    patchConsole: false,
    exitOnCtrlC: false,
    ...options,
  })
}
