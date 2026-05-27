#!/usr/bin/env bun
import React from 'react'
import { Box as NpmBox, Text as NpmText } from 'ink'
import { Readable, Writable } from 'stream'
import { renderSync } from './root.js'
import Box from './components/Box.js'
import Text from './components/Text.js'
import { ProgressBar } from './components/design-system/ProgressBar.js'
import { ThemeProvider } from './components/design-system/ThemeProvider.js'
import { MetricCard } from './components/design-system/MetricCard.js'
import { AlternateScreen } from './components/AlternateScreen.js'
import { StartupScreen } from './components/StartupScreen.js'
import { TerminalWriteProvider } from './useTerminalNotification.js'
import { useTerminalNotification } from './useTerminalNotification.js'
import {
  EBP,
  EFE,
  ENABLE_MOUSE_TRACKING,
  ENTER_ALT_SCREEN,
  EXIT_ALT_SCREEN,
} from './termio/dec.js'
import instances from './instances.js'
import { useWidths } from './hooks/useTermWidth.js'
import { useTabStatus } from './hooks/use-tab-status.js'
import { useTerminalTitle } from './hooks/use-terminal-title.js'
import { useHasSelection, useSelection } from './hooks/use-selection.js'
import { useSearchHighlight } from './hooks/use-search-highlight.js'
import useInput from './hooks/use-input.js'
import useApp from './hooks/use-app.js'
import { ActionPanel } from './panels/Action/index.tsx'
import { ZonesView } from './views/ZonesView.tsx'
import { CoreView } from './views/CoreView.tsx'
import { DetachedStack, type StackOp } from './components/DetachedStack.tsx'
import { AppShell } from './components/AppShell.tsx'
import { OperationOverlay } from './OperationOverlay.tsx'
import { useBackgroundOps } from './hooks/useBackgroundOps.ts'
import { handleMouseEvent } from './components/App.js'
import { createSelectionState } from './selection.js'
import type { Zone } from '../config/zones.js'
import type { Status } from './docker.js'
import type { DOMElement } from './dom.js'
import type { UnaxisEnvironment } from './environment-store.js'
import { ContainersView } from './panels/Env/views/containers/ContainersView.js'
import { LocalEnginePreviewRoot } from './localEnginePreview.js'
import { WelcomeScreen } from '../screens/WelcomeScreen.js'

class MemoryWriteStream extends Writable {
  columns = 80
  rows = 24
  isTTY = true
  output = ''

  _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.output += chunk.toString()
    callback()
  }
}

class EmptyReadStream extends Readable {
  isTTY = true
  setRawMode(_enabled: boolean): this {
    return this
  }

  setEncoding(_encoding: BufferEncoding): this {
    return this
  }

  ref(): this {
    return this
  }

  unref(): this {
    return this
  }

  send(data: string): void {
    this.push(Buffer.from(data))
    this.emit('readable')
  }

  _read(): void {}
}

type SmokeCase = {
  name: string
  element: React.ReactNode
  expected: string
  expectedRaw?: string
  expectedRawValues?: string[]
  rerenderElement?: React.ReactNode
  expectedAfterRerender?: string
  expectedRawAfterUnmount?: string
  afterRender?: (
    instance: ReturnType<typeof renderSync>,
    stdout: MemoryWriteStream,
    stdin: EmptyReadStream,
  ) => void
  localRuntimeOnly?: boolean
}

function ResizeProbe() {
  const { tw, th } = useWidths()
  return <Text>{`size:${tw}x${th}`}</Text>
}

function TerminalSideEffectProbe() {
  const terminal = useTerminalNotification()
  useTabStatus('idle')

  React.useEffect(() => {
    terminal.notifyBell()
  }, [terminal])

  return <Text>terminal side effects</Text>
}

function TerminalTitleProbe() {
  useTerminalTitle('UNAXIS Smoke Title')
  return <Text>terminal title</Text>
}

function SelectionSearchProbe() {
  const selection = useSelection()
  const hasSelection = useHasSelection()
  const searchHighlight = useSearchHighlight()

  React.useEffect(() => {
    selection.clearSelection()
    selection.setSelectionBgColor('#ffffff')
    searchHighlight.setQuery('probe')
    searchHighlight.setPositions(null)
    searchHighlight.scanElement(null as never)
  }, [searchHighlight, selection])

  return <Text>{`selection:${hasSelection ? 'yes' : 'no'} search hooks`}</Text>
}

function SearchElementScanProbe() {
  const searchHighlight = useSearchHighlight()
  const ref = React.useRef<DOMElement>(null)
  const [matches, setMatches] = React.useState(0)

  React.useEffect(() => {
    if (!ref.current) {
      return
    }

    searchHighlight.setQuery('axis')
    setMatches(searchHighlight.scanElement(ref.current).length)
  }, [searchHighlight])

  return (
    <Box flexDirection="column" ref={ref}>
      <Text>Unaxis axis AXIS</Text>
      <Text>{`scan:${matches}`}</Text>
    </Box>
  )
}

function BackgroundOpsProbe() {
  const ops = useBackgroundOps({
    addNotification: () => {},
    refreshZones: () => {},
    setZones: () => {},
  })
  const started = React.useRef(false)

  React.useEffect(() => {
    if (started.current) {
      return
    }

    started.current = true
    ops.runOp('Fake Deploy', async onLine => {
      onLine('fake line')
      return 0
    })
  }, [ops])

  return (
    <Box flexDirection="column">
      <Text>{`ops:${ops.bgOps.length}`}</Text>
      {ops.bgOps.map(op => (
        <Text key={op.id}>{`${op.title}:${op.busy ? 'busy' : 'done'}:${op.lines.at(-1) ?? ''}`}</Text>
      ))}
    </Box>
  )
}

function LocalInputProbe() {
  const [lastInput, setLastInput] = React.useState('none')

  useInput(input => {
    setLastInput(input || 'special')
  })

  return <Text>{`input:${lastInput}`}</Text>
}

function LocalWelcomeInputProbe() {
  const [action, setAction] = React.useState('none')

  return (
    <Box flexDirection="column">
      <WelcomeScreen
        zones={[]}
        zoneStatuses={{}}
        proxyStatus="missing"
        busy={false}
        onManage={() => setAction('manage')}
        onSettings={() => setAction('settings')}
        onQuit={() => setAction('quit')}
        onRelease={() => setAction('release')}
        onBuild={() => setAction('build')}
        isActive
      />
      <Text>{`welcome-action:${action}`}</Text>
    </Box>
  )
}

function LocalExitProbe() {
  const { exit } = useApp()

  useInput(input => {
    if (input === 'x') {
      exit()
    }
  })

  return <Text>exit-probe</Text>
}

function LocalKeyboardEventProbe() {
  const [lastKey, setLastKey] = React.useState('none')

  return (
    <Box
      autoFocus
      tabIndex={0}
      onKeyDown={event => {
        setLastKey(event.key)
      }}
    >
      <Text>{`dom-key:${lastKey}`}</Text>
    </Box>
  )
}

function LocalFocusTraversalProbe() {
  const [focused, setFocused] = React.useState('none')

  return (
    <Box flexDirection="column">
      <Box tabIndex={0} onFocus={() => setFocused('first')}>
        <Text>first</Text>
      </Box>
      <Box tabIndex={0} onFocus={() => setFocused('second')}>
        <Text>{`focus:${focused}`}</Text>
      </Box>
    </Box>
  )
}

function LocalMouseInputProbe() {
  const [state, setState] = React.useState('idle')

  return (
    <TerminalWriteProvider value={data => stdoutWriteForSmoke(data)}>
      <AlternateScreen mouseTracking>
        <Box
          width={20}
          height={3}
          onMouseEnter={() => setState('hover')}
          onMouseLeave={() => setState('leave')}
          onClick={() => setState('click')}
        >
          <Text>{`mouse:${state}`}</Text>
        </Box>
      </AlternateScreen>
    </TerminalWriteProvider>
  )
}

function LocalRuntimeDetachedStackInputProbe() {
  const [action, setAction] = React.useState('none')

  return (
    <ThemeProvider initialState="dark" enableAutoTheme={false}>
      <Box flexDirection="column">
        <Text>{`stack-action:${action}`}</Text>
        <DetachedStack
          ops={demoOps}
          focusedId={1}
          isActive
          onDown={() => setAction('down')}
          onUp={() => setAction('up')}
          onEnter={() => setAction('enter')}
          onClose={() => setAction('close')}
        />
      </Box>
    </ThemeProvider>
  )
}

function LocalRuntimeZonesViewInputProbe() {
  const [action, setAction] = React.useState('none')

  return (
    <ThemeProvider initialState="dark" enableAutoTheme={false}>
      <Box flexDirection="column">
        <Text>{`zones-action:${action}`}</Text>
        <ZonesView
          zones={demoZones}
          zoneStatuses={demoStatuses}
          proxyStatus="running"
          setZones={() => {}}
          runOp={noopOperation}
          openLogs={() => setAction('logs')}
          addNotification={() => {}}
          onGoBack={() => setAction('back')}
          onNewZone={() => setAction('new-zone')}
          onSubCrumbs={() => {}}
          isActive
        />
      </Box>
    </ThemeProvider>
  )
}

function LocalRuntimeCoreViewInputProbe() {
  const [action, setAction] = React.useState('none')

  return (
    <ThemeProvider initialState="dark" enableAutoTheme={false}>
      <Box flexDirection="column">
        <Text>{`core-action:${action}`}</Text>
        <CoreView
          zones={demoZones}
          zoneStatuses={demoStatuses}
          proxyStatus="running"
          runOp={noopOperation}
          openLogs={() => setAction('logs')}
          runDevMode={() => setAction('dev')}
          addNotification={() => {}}
          onGoBack={() => setAction('back')}
          onEnter={() => {}}
          isActive
        />
      </Box>
    </ThemeProvider>
  )
}

function LocalRuntimeOperationOverlayInputProbe() {
  const [action, setAction] = React.useState('none')

  return (
    <ThemeProvider initialState="dark" enableAutoTheme={false}>
      <Box flexDirection="column">
        <Text>{`overlay-action:${action}`}</Text>
        <OperationOverlay
          title="Deploy Demo Zone"
          lines={['Preparing compose', 'Pulling image', 'Starting service']}
          busy={false}
          mode="output"
          onQ={() => setAction('back')}
          onCopy={() => setAction('copy')}
          onEnter={() => setAction('enter')}
        />
      </Box>
    </ThemeProvider>
  )
}

function LocalRuntimeContainersViewInputProbe() {
  const [action, setAction] = React.useState('none')

  return (
    <ThemeProvider initialState="dark" enableAutoTheme={false}>
      <Box flexDirection="column">
        <Text>{`containers-action:${action}`}</Text>
        <ContainersView
          env={demoEnvironment}
          onBack={() => setAction('back')}
        />
      </Box>
    </ThemeProvider>
  )
}

const ITERM2_PROGRESS_START = '\x1b]9;4;1\x07'
const ITERM2_PROGRESS_STOP = '\x1b]9;4;0\x07'

const demoZones: Zone[] = [
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

const demoStatuses: Record<string, Status> = {
  unenter: 'running',
  demo: 'running',
}

const demoEnvironment: UnaxisEnvironment = {
  id: 'env-local',
  name: 'Local Docker',
  type: 'local-docker',
  status: 'unknown',
  active: false,
  isDefaultTarget: true,
  dockerUrl: 'unix:///var/run/docker.sock',
  machineRole: 'App DB Proxy Zones',
  agentUrl: '',
  agentPort: 8001,
  agentStatus: 'unknown',
  agentLastSeenAt: null,
  agentVersion: '',
  agentTokenSecretId: null,
  npmHost: 'localhost',
  npmPort: 81,
  proxyHost: 'localhost',
  proxyPort: 3080,
  domain: 'local.unaxis',
  ddnsHostname: '',
  publicUrl: 'http://localhost',
  tlsConfig: {
    tls: false,
    skipVerify: false,
    skipClientVerify: false,
    caCertPath: '',
    certPath: '',
    keyPath: '',
  },
  npmSecretId: null,
  azureAppIdSecretId: null,
  azureTenantIdSecretId: null,
  azureAuthKeySecretId: null,
  tags: [],
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const demoOps: StackOp[] = [
  {
    id: 1,
    title: 'Deploy Demo Zone',
    lines: ['Preparing compose', 'Pulling image', 'Starting service'],
    busy: true,
    isLog: false,
  },
  {
    id: 2,
    title: 'Logs Demo Zone',
    lines: ['GET / 200', 'Ready in 120ms'],
    busy: false,
    isLog: true,
  },
]

const noopRunOp = async () => {}
const noopOperation = (
  _title: string,
  _op: (onLine: (line: string) => void) => Promise<number>,
) => {}

const COLOR_COMPAT_RAW = ['\x1b[35m', '\x1b[2m']

const cases: SmokeCase[] = [
  {
    name: 'local-primitives',
    expected: 'UNAXISlocalInksmoke',
    element: (
      <Box flexDirection="column" width={40}>
        <Text bold>UNAXIS local Ink smoke</Text>
        <Box>
          <Text color="green">render:</Text>
          <Text> ok</Text>
        </Box>
      </Box>
    ),
  },
  {
    name: 'local-ink-color-compat',
    expected: 'namedcolordimborder',
    expectedRawValues: COLOR_COMPAT_RAW,
    element: (
      <Box borderStyle="single" borderColor="magenta" width={30}>
        <Text color="magenta" dimColor>
          named color dim border
        </Text>
      </Box>
    ),
  },
  {
    name: 'npm-ink-primitives',
    expected: 'npmInkcompat',
    element: (
      <NpmBox flexDirection="column" width={40}>
        <NpmText>npm Ink compat</NpmText>
      </NpmBox>
    ),
  },
  {
    name: 'unaxis-design-system',
    expected: 'progress',
    element: (
      <NpmBox flexDirection="column" width={40}>
        <NpmText>progress</NpmText>
        <ProgressBar ratio={0.5} width={10} />
      </NpmBox>
    ),
  },
  {
    name: 'themed-components',
    expected: 'Requests++',
    element: (
      <ThemeProvider initialState="dark" enableAutoTheme={false}>
        <MetricCard label="Requests" value="42" note="stable" trend="++" />
      </ThemeProvider>
    ),
  },
  {
    name: 'rerender',
    expected: 'phaseone',
    expectedAfterRerender: 'two',
    element: <Text>phase one</Text>,
    rerenderElement: <Text>phase two</Text>,
  },
  {
    name: 'resize',
    expected: 'size:80x24',
    expectedAfterRerender: '4212',
    element: <ResizeProbe key="initial" />,
    afterRender: (instance, stdout) => {
      stdout.columns = 42
      stdout.rows = 12
      stdout.emit('resize')
      instance.rerender(<SmokeApp element={<ResizeProbe key="resized" />} />)
    },
  },
  {
    name: 'alternate-screen',
    expected: 'altscreen',
    expectedRaw: ENTER_ALT_SCREEN,
    expectedRawAfterUnmount: EXIT_ALT_SCREEN,
    element: (
      <TerminalWriteProvider value={data => stdoutWriteForSmoke(data)}>
        <AlternateScreen mouseTracking={false}>
          <Box>
            <Text>alt screen</Text>
          </Box>
        </AlternateScreen>
      </TerminalWriteProvider>
    ),
  },
  {
    name: 'shutdown-resume-contract',
    expected: 'shutdowncontract',
    expectedRawValues: [ENTER_ALT_SCREEN, ENABLE_MOUSE_TRACKING],
    element: (
      <TerminalWriteProvider value={data => stdoutWriteForSmoke(data)}>
        <AlternateScreen mouseTracking>
          <Text>shutdown contract</Text>
        </AlternateScreen>
      </TerminalWriteProvider>
    ),
    afterRender: (_instance, stdout, stdin) => {
      const ink = instances.get(stdout as unknown as NodeJS.WriteStream) as
        | {
            isAltScreenActive?: boolean
            drainStdin?: () => void
            detachForShutdown?: () => void
            handleStdinResume?: () => void
          }
        | undefined

      if (!ink?.isAltScreenActive) {
        throw new Error('local Ink instance did not expose active alt-screen state')
      }

      stdin.send('queued-before-shutdown')
      ink.drainStdin?.()
      ink.handleStdinResume?.()
      if (!stdout.output.includes(EBP) || !stdout.output.includes(EFE)) {
        throw new Error('stdin resume did not reassert terminal input modes')
      }

      ink.detachForShutdown?.()
      if (instances.has(stdout as unknown as NodeJS.WriteStream)) {
        throw new Error('detachForShutdown did not remove the local Ink instance')
      }
    },
  },
  {
    name: 'startup-progress',
    expected: 'UNAXIS',
    expectedRaw: ITERM2_PROGRESS_START,
    expectedRawAfterUnmount: ITERM2_PROGRESS_STOP,
    element: <StartupScreen onDone={() => {}} />,
  },
  {
    name: 'terminal-side-effects',
    expected: 'terminalsideeffects',
    expectedRawValues: ['\x07', 'Idle'],
    element: (
      <TerminalWriteProvider value={data => stdoutWriteForSmoke(data)}>
        <TerminalSideEffectProbe />
      </TerminalWriteProvider>
    ),
  },
  {
    name: 'terminal-title',
    expected: 'terminaltitle',
    expectedRaw:
      process.platform === 'win32' ? undefined : '\x1b]0;UNAXIS Smoke Title\x07',
    element: (
      <TerminalWriteProvider value={data => stdoutWriteForSmoke(data)}>
        <TerminalTitleProbe />
      </TerminalWriteProvider>
    ),
    afterRender: () => {
      if (
        process.platform === 'win32' &&
        process.title !== 'UNAXIS Smoke Title'
      ) {
        throw new Error(`terminal title was not set: ${process.title}`)
      }
    },
  },
  {
    name: 'selection-search-hooks',
    expected: 'selection:nosearchhooks',
    element: <SelectionSearchProbe />,
  },
  {
    name: 'search-element-scan',
    expected: 'scan:0',
    expectedAfterRerender: '3',
    element: <SearchElementScanProbe />,
  },
  {
    name: 'static-unaxis-action-panel',
    expected: 'Deletezone',
    element: (
      <ThemeProvider initialState="dark" enableAutoTheme={false}>
        <ActionPanel
          selected={0}
          status="running"
          zone={{
            key: 'demo',
            label: 'Demo Zone',
            domain: 'demo.local',
            service: 'demo',
            container: 'demo',
            image: 'ghcr.io/unaxis/demo',
            dockerfile: 'Dockerfile',
            upstreamEnvKey: 'UPSTREAM_DEMO',
          }}
        />
      </ThemeProvider>
    ),
  },
  {
    name: 'static-unaxis-zones-view',
    expected: 'DemoZone',
    element: (
      <ThemeProvider initialState="dark" enableAutoTheme={false}>
        <ZonesView
          zones={demoZones}
          zoneStatuses={demoStatuses}
          proxyStatus="running"
          setZones={() => {}}
          runOp={noopOperation}
          openLogs={() => {}}
          addNotification={() => {}}
          onGoBack={() => {}}
          onNewZone={() => {}}
          onSubCrumbs={() => {}}
          isActive={false}
        />
      </ThemeProvider>
    ),
  },
  {
    name: 'static-unaxis-core-view',
    expected: 'PlatformCore',
    element: (
      <ThemeProvider initialState="dark" enableAutoTheme={false}>
        <CoreView
          zones={demoZones}
          zoneStatuses={demoStatuses}
          proxyStatus="running"
          runOp={noopOperation}
          openLogs={() => {}}
          runDevMode={() => {}}
          addNotification={() => {}}
          onGoBack={() => {}}
          onEnter={() => {
            void noopRunOp()
          }}
          isActive={false}
        />
      </ThemeProvider>
    ),
  },
  {
    name: 'static-unaxis-detached-stack',
    expected: 'DeployDemoZone',
    element: (
      <ThemeProvider initialState="dark" enableAutoTheme={false}>
        <DetachedStack
          ops={demoOps}
          focusedId={1}
          isActive={false}
        />
      </ThemeProvider>
    ),
  },
  {
    name: 'static-unaxis-app-shell-with-stack',
    expected: 'DeployDemoZone',
    element: (
      <ThemeProvider initialState="dark" enableAutoTheme={false}>
        <AppShell
          view="zones"
          history={['zones']}
          subCrumbs={['demo']}
          bgOps={demoOps}
          stackOpen={true}
          stackFocused={false}
          stackFocusId={1}
          notifications={[]}
          didCopy={false}
        >
          <Text>shell body</Text>
        </AppShell>
      </ThemeProvider>
    ),
  },
  {
    name: 'static-unaxis-operation-overlay',
    expected: 'Startingservice',
    element: (
      <ThemeProvider initialState="dark" enableAutoTheme={false}>
        <OperationOverlay
          title="Deploy Demo Zone"
          lines={['Preparing compose', 'Pulling image', 'Starting service']}
          busy={true}
          mode="output"
        />
      </ThemeProvider>
    ),
  },
  {
    name: 'background-ops-hook',
    expected: 'FakeDeploy:busy',
    expectedAfterRerender: 'done',
    element: (
      <ThemeProvider initialState="dark" enableAutoTheme={false}>
        <BackgroundOpsProbe />
      </ThemeProvider>
    ),
  },
  {
    name: 'local-use-input',
    expected: 'input:none',
    expectedAfterRerender: 'j',
    element: <LocalInputProbe />,
    afterRender: (_instance, _stdout, stdin) => {
      stdin.send('j')
    },
  },
  {
    name: 'local-welcome-input',
    expected: 'welcome-action:none',
    expectedAfterRerender: 'settings',
    element: <LocalWelcomeInputProbe />,
    afterRender: (_instance, _stdout, stdin) => {
      stdin.send('\x1b[B')
      setTimeout(() => stdin.send('\r'), 0)
    },
    localRuntimeOnly: true,
  },
  {
    name: 'local-keyboard-event-dispatch',
    expected: 'dom-key:none',
    expectedAfterRerender: 'x',
    element: <LocalKeyboardEventProbe />,
    afterRender: (_instance, _stdout, stdin) => {
      stdin.send('x')
    },
  },
  {
    name: 'local-focus-traversal',
    expected: 'focus:none',
    expectedAfterRerender: 'second',
    element: <LocalFocusTraversalProbe />,
    afterRender: (_instance, _stdout, stdin) => {
      stdin.send('\t')
    },
  },
  {
    name: 'live-stdin-mouse-dispatch',
    expected: 'mouse:idle',
    expectedRaw: ENABLE_MOUSE_TRACKING,
    expectedAfterRerender: 'click',
    expectedRawAfterUnmount: EXIT_ALT_SCREEN,
    element: <LocalMouseInputProbe />,
    afterRender: (_instance, _stdout, stdin) => {
      stdin.send('\x1b[<35;1;1M')
      stdin.send('\x1b[<0;1;1M')
      stdin.send('\x1b[<0;1;1m')
    },
  },
  {
    name: 'local-runtime-detached-stack-input',
    expected: 'stack-action:none',
    expectedAfterRerender: 'down',
    element: <LocalRuntimeDetachedStackInputProbe />,
    localRuntimeOnly: true,
    afterRender: (_instance, _stdout, stdin) => {
      stdin.send('j')
    },
  },
  {
    name: 'local-runtime-zones-view-input',
    expected: 'zones-action:none',
    expectedAfterRerender: 'new-zone',
    element: <LocalRuntimeZonesViewInputProbe />,
    localRuntimeOnly: true,
    afterRender: (_instance, _stdout, stdin) => {
      stdin.send('n')
    },
  },
  {
    name: 'local-runtime-core-view-input',
    expected: 'core-action:none',
    expectedAfterRerender: 'logs',
    element: <LocalRuntimeCoreViewInputProbe />,
    localRuntimeOnly: true,
    afterRender: (_instance, _stdout, stdin) => {
      stdin.send('l')
    },
  },
  {
    name: 'local-runtime-operation-overlay-input',
    expected: 'overlay-action:none',
    expectedAfterRerender: 'back',
    element: <LocalRuntimeOperationOverlayInputProbe />,
    localRuntimeOnly: true,
    afterRender: (_instance, _stdout, stdin) => {
      stdin.send('q')
    },
  },
  {
    name: 'local-runtime-containers-view-input',
    expected: 'containers-action:none',
    expectedAfterRerender: 'back',
    element: <LocalRuntimeContainersViewInputProbe />,
    localRuntimeOnly: true,
    afterRender: (_instance, _stdout, stdin) => {
      stdin.send('q')
    },
  },
  {
    name: 'local-engine-preview-assembly',
    expected: 'Localenginepreview',
    expectedRaw: ENTER_ALT_SCREEN,
    expectedRawAfterUnmount: EXIT_ALT_SCREEN,
    element: (
      <LocalEnginePreviewRoot terminalWrite={data => stdoutWriteForSmoke(data)} />
    ),
    localRuntimeOnly: true,
  },
]

function runMouseDispatchSmoke(): void {
  const selection = createSelectionState()
  let hoverAt = ''
  let clickAt = ''
  let changes = 0

  const app = {
    props: {
      selection,
      onSelectionChange: () => {
        changes++
      },
      onHoverAt: (col: number, row: number) => {
        hoverAt = `${col},${row}`
      },
      onClickAt: (col: number, row: number) => {
        clickAt = `${col},${row}`
        return true
      },
      onSelectionDrag: (col: number, row: number) => {
        selection.focus = { col, row }
        changes++
      },
      onMultiClick: () => {},
      getHyperlinkAt: () => undefined,
      onOpenHyperlink: () => {},
    },
    lastHoverCol: -1,
    lastHoverRow: -1,
    lastClickTime: 0,
    lastClickCol: -1,
    lastClickRow: -1,
    clickCount: 0,
    pendingHyperlinkTimer: null,
  }

  handleMouseEvent(app as never, {
    kind: 'mouse',
    button: 35,
    action: 'press',
    col: 2,
    row: 3,
    sequence: '\x1b[<35;2;3M',
  })

  handleMouseEvent(app as never, {
    kind: 'mouse',
    button: 0,
    action: 'press',
    col: 4,
    row: 5,
    sequence: '\x1b[<0;4;5M',
  })

  handleMouseEvent(app as never, {
    kind: 'mouse',
    button: 0,
    action: 'release',
    col: 4,
    row: 5,
    sequence: '\x1b[<0;4;5m',
  })

  if (hoverAt !== '1,2' || clickAt !== '3,4' || changes < 2) {
    throw new Error(
      [
        'Local Ink mouse dispatch smoke failed',
        `hoverAt: ${hoverAt}`,
        `clickAt: ${clickAt}`,
        `changes: ${changes}`,
      ].join('\n'),
    )
  }
}

let activeSmokeStdout: MemoryWriteStream | null = null

function stdoutWriteForSmoke(data: string): void {
  activeSmokeStdout?.write(data)
}

function SmokeApp({ element }: { element: React.ReactNode }) {
  return (
    <Box flexDirection="column" width={60}>
      {element}
    </Box>
  )
}

function settleEffects(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

async function settleAsyncWork(): Promise<void> {
  await settleEffects()
  await settleEffects()
  await settleEffects()
}

async function runSmokeCase(smokeCase: SmokeCase): Promise<void> {
  const stdout = new MemoryWriteStream()
  const stderr = new MemoryWriteStream()
  const stdin = new EmptyReadStream()
  activeSmokeStdout = stdout

  let instance: ReturnType<typeof renderSync> | null = null
  try {
    instance = renderSync(<SmokeApp element={smokeCase.element} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      patchConsole: false,
      exitOnCtrlC: false,
    })

    await settleEffects()

    if (smokeCase.rerenderElement) {
      instance.rerender(<SmokeApp element={smokeCase.rerenderElement} />)
      await settleEffects()
    }

    smokeCase.afterRender?.(instance, stdout, stdin)
    await settleAsyncWork()
  } finally {
    if (instance) {
      instance.unmount()
      await settleEffects()
    }

    activeSmokeStdout = null
  }

  instance?.cleanup()

  const visibleOutput = stdout.output.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
  const normalizedOutput = visibleOutput.replace(/\s+/g, '')

  if (!normalizedOutput.includes(smokeCase.expected)) {
    throw new Error(
      [
        `Local Ink smoke failed: ${smokeCase.name}`,
        `expected: ${smokeCase.expected}`,
        `stdout bytes: ${stdout.output.length}`,
        `visible output: ${JSON.stringify(visibleOutput.slice(-240))}`,
      ].join('\n'),
    )
  }

  const rawExpectations = [
    ...(smokeCase.expectedRaw ? [smokeCase.expectedRaw] : []),
    ...(smokeCase.expectedRawValues ?? []),
  ]

  for (const expectedRaw of rawExpectations) {
    if (stdout.output.includes(expectedRaw)) {
      continue
    }

    throw new Error(
      [
        `Local Ink smoke failed: ${smokeCase.name}`,
        'expected raw terminal sequence was not written',
        `stdout bytes: ${stdout.output.length}`,
      ].join('\n'),
    )
  }

  if (
    smokeCase.expectedAfterRerender &&
    !normalizedOutput.includes(smokeCase.expectedAfterRerender)
  ) {
    throw new Error(
      [
        `Local Ink smoke failed: ${smokeCase.name}`,
        `expected after rerender: ${smokeCase.expectedAfterRerender}`,
        `stdout bytes: ${stdout.output.length}`,
        `visible output: ${JSON.stringify(visibleOutput.slice(-240))}`,
      ].join('\n'),
    )
  }

  if (
    smokeCase.expectedRawAfterUnmount &&
    !stdout.output.includes(smokeCase.expectedRawAfterUnmount)
  ) {
    throw new Error(
      [
        `Local Ink smoke failed: ${smokeCase.name}`,
        'expected raw terminal sequence after unmount was not written',
        `stdout bytes: ${stdout.output.length}`,
      ].join('\n'),
    )
  }
}

async function runWaitUntilExitSmoke(): Promise<void> {
  const stdout = new MemoryWriteStream()
  const stderr = new MemoryWriteStream()
  const stdin = new EmptyReadStream()
  const instance = renderSync(<SmokeApp element={<LocalExitProbe />} />, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stderr as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
  })

  await settleEffects()
  stdin.send('x')

  try {
    await Promise.race([
      instance.waitUntilExit(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('waitUntilExit did not settle after exit')),
          1000,
        ),
      ),
    ])
  } finally {
    instance.cleanup()
  }
}

async function runOnFrameSmoke(): Promise<void> {
  const stdout = new MemoryWriteStream()
  const stderr = new MemoryWriteStream()
  const stdin = new EmptyReadStream()
  let frames = 0
  let lastDuration = -1
  const instance = renderSync(<SmokeApp element={<Text>frame-probe</Text>} />, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stderr as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
    onFrame: event => {
      frames++
      lastDuration = event.durationMs
    },
  })

  try {
    await settleEffects()
    if (frames === 0 || lastDuration < 0) {
      throw new Error('onFrame was not called by the local Ink engine')
    }
  } finally {
    instance.unmount()
    await settleEffects()
    instance.cleanup()
  }
}

const previousUserType = process.env.USER_TYPE
process.env.USER_TYPE = 'ant'

try {
  for (const smokeCase of cases) {
    if (
      smokeCase.localRuntimeOnly &&
      process.env.UNAXIS_LOCAL_INK_RUNTIME !== '1'
    ) {
      continue
    }

    await runSmokeCase(smokeCase)
  }
  runMouseDispatchSmoke()
  await runWaitUntilExitSmoke()
  await runOnFrameSmoke()
} finally {
  if (previousUserType === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = previousUserType
  }
}

console.log('local-ink-smoke: ok')
