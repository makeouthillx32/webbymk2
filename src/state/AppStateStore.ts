import type { Notification } from '../context/notifications.js'
import type { Store } from './store.js'

export type AppView =
  | 'welcome'
  | 'settings'
  | 'core'
  | 'zones'
  | 'npm'
  | 'db'
  | 'infra'
  | 'env'
  | 'wizard'
  | 'instance-wizard'
  | 'clone-wizard'
  | 'notes'

export const PANEL_TABS = ['core', 'zones', 'npm', 'db', 'infra', 'env'] as const
export type PanelTab = (typeof PANEL_TABS)[number]

export type ProxyRuntimeStatus = 'unknown' | 'running' | 'stopped' | 'starting' | 'error'

export type BackgroundOperation = {
  id: number
  title: string
  lines: string[]
  busy: boolean
  isLog?: boolean
  dismissable?: boolean
  devReady?: boolean
}

export type RuntimeSessionState = {
  cwd: string
  view: AppView
  proxyStatus: string
  activeEnvironmentName?: string
  activeEnvironmentType?: string
  activeWatchId?: string
}

export type OverlayState = {
  overlayOpId: number | null
  activeOverlays: ReadonlySet<string>
}

export type StackState = {
  stackOpen: boolean
  stackFocused: boolean
  stackManagerOpen: boolean
  stackFocusId: number | null
}

export type NavigationState = {
  view: AppView
  history: AppView[]
  subCrumbs: string[]
  tokenEditing: boolean
}

export type AppState = {
  navigation: NavigationState
  splashDone: boolean
  stack: StackState
  overlay: OverlayState
  bgOps: BackgroundOperation[]
  notifications: {
    current: Notification | null
    queue: Notification[]
  }
  runtimeSession: RuntimeSessionState
}

export type AppStateStore = Store<AppState>

export function getDefaultAppState(): AppState {
  return {
    navigation: {
      view: 'welcome',
      history: ['welcome'],
      subCrumbs: [],
      tokenEditing: false,
    },
    splashDone: false,
    stack: {
      stackOpen: false,
      stackFocused: false,
      stackManagerOpen: false,
      stackFocusId: null,
    },
    overlay: {
      overlayOpId: null,
      activeOverlays: new Set<string>(),
    },
    bgOps: [],
    notifications: {
      current: null,
      queue: [],
    },
    runtimeSession: {
      cwd: process.cwd(),
      view: 'welcome',
      proxyStatus: 'unknown',
    },
  }
}
