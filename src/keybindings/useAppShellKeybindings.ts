import { useKeybindings } from './useKeybinding.js'
import type { Dispatch, SetStateAction } from '../ink/react.js'
import type { Zone } from '../config/zones.js'

export type AppView = 'welcome' | 'settings' | 'zones' | 'npm' | 'db' | 'infra' | 'wizard'

const PANEL_TABS = ['zones', 'npm', 'db', 'infra'] as const

type AppShellKeybindingArgs = {
  view: AppView
  tokenEditing: boolean
  welcomeMenu: number
  setWelcomeMenu: Dispatch<SetStateAction<number>>
  zones: Zone[]
  zoneSelected: number
  setZoneSelected: Dispatch<SetStateAction<number>>
  actionOpen: boolean
  setActionOpen: Dispatch<SetStateAction<boolean>>
  setActionSelected: Dispatch<SetStateAction<number>>
  firstEnabled: (zone: Zone) => number
  navigateTo: (next: AppView) => void
  navigateBack: () => void
  openConfigInEditor: () => void
  exit: () => void
  refreshStatuses: () => void
  onZoneLogs: (zone: Zone) => void
  onZoneDelete: (zone: Zone) => void
  onZoneGitPush: () => void
  onZoneRefreshGateway: () => void
  onZoneBuildAll: () => void
  onZoneDeployAll: () => void
  setNpmSelected: Dispatch<SetStateAction<number>>
  setStackOpen: Dispatch<SetStateAction<boolean>>
  executeAction: (actionId: string, zone: Zone) => void
  buildActions: (zone: Zone) => any[]
}

export function useAppShellKeybindings({
  view,
  tokenEditing,
  welcomeMenu,
  setWelcomeMenu,
  zones,
  zoneSelected,
  setZoneSelected,
  actionOpen,
  setActionOpen,
  setActionSelected,
  firstEnabled,
  navigateTo,
  navigateBack,
  openConfigInEditor,
  exit,
  refreshStatuses,
  onZoneLogs,
  onZoneDelete,
  onZoneGitPush,
  onZoneRefreshGateway,
  onZoneBuildAll,
  onZoneDeployAll,
  setNpmSelected,
  setStackOpen,
  executeAction,
  buildActions,
}: AppShellKeybindingArgs) {
  useKeybindings(
    {
      'app:interrupt': () => {
        exit()
      },
      'app:redraw': () => {
        process.stdout.write("\x1bc")
      },
      'app:nextPanel': () => {
        if (actionOpen || view === 'wizard') return
        const idx = PANEL_TABS.indexOf(view as (typeof PANEL_TABS)[number])
        const next = PANEL_TABS[(idx + 1) % PANEL_TABS.length] ?? PANEL_TABS[0]
        navigateTo(next)
        setActionOpen(false)
      },
      'app:prevPanel': () => {
        if (actionOpen || view === 'wizard') return
        const idx = PANEL_TABS.indexOf(view as (typeof PANEL_TABS)[number])
        const prev = PANEL_TABS[(idx - 1 + PANEL_TABS.length) % PANEL_TABS.length] ?? PANEL_TABS[0]
        navigateTo(prev)
        setActionOpen(false)
      },
      'app:toggleStack': () => {
        setStackOpen((prev) => !prev)
      },
    },
    { context: 'Global', isActive: true },
  )

  useKeybindings(
    {
      'welcome:up': () => {
        setWelcomeMenu((current) => Math.max(0, current - 1))
      },
      'welcome:down': () => {
        setWelcomeMenu((current) => Math.min(1, current + 1))
      },
      'welcome:select': () => {
        if (welcomeMenu === 0) navigateTo('zones')
        else navigateTo('settings')
      },
      'welcome:settings': () => {
        navigateTo('settings')
      },
      'app:exit': () => {
        exit()
      },
    },
    { context: 'Welcome', isActive: view === 'welcome' && !tokenEditing },
  )

  useKeybindings(
    {
      'app:back': () => {
        navigateBack()
      },
      'settings:openEditor': () => {
        openConfigInEditor()
      },
    },
    { context: 'Settings', isActive: view === 'settings' && !tokenEditing },
  )

  useKeybindings(
    {
      'zones:up': () => {
        if (zones.length === 0) return
        setZoneSelected((current) => Math.max(0, current - 1))
      },
      'zones:down': () => {
        if (zones.length === 0) return
        setZoneSelected((current) => Math.min(zones.length - 1, current + 1))
      },
      'zones:open': () => {
        const zone = zones[zoneSelected]
        if (!zone) return
        setActionSelected(firstEnabled(zone))
        setActionOpen(true)
      },
      'zones:refresh': () => {
        refreshStatuses()
      },
      'zones:logs': () => {
        const zone = zones[zoneSelected]
        if (zone) onZoneLogs(zone)
      },
      'zones:newZone': () => {
        navigateTo('wizard')
      },
      'zones:create': () => {
        navigateTo('wizard')
      },
      'zones:delete': () => {
        const zone = zones[zoneSelected]
        if (zone) onZoneDelete(zone)
      },
      'zones:gitPush': () => {
        onZoneGitPush()
      },
      'zones:refreshGateway': () => {
        onZoneRefreshGateway()
      },
      'zones:buildAll': () => {
        onZoneBuildAll()
      },
      'zones:deployAll': () => {
        onZoneDeployAll()
      },
      'app:back': () => {
        navigateBack()
      },
    },
    { context: 'Zones', isActive: view === 'zones' && !actionOpen && !tokenEditing },
  )

  useKeybindings(
    {
      'app:back': () => {
        navigateBack()
      },
      'npm:up': () => {
        setNpmSelected((current) => Math.max(0, current - 1))
      },
      'npm:down': () => {
        setNpmSelected((current) => current + 1)
      },
    },
    { context: 'Npm', isActive: view === 'npm' && !tokenEditing },
  )

  useKeybindings(
    {
      'action:up': () => {
        const zone = zones[zoneSelected]
        if (!zone) return
        const actions = buildActions(zone)
        setActionSelected((s) => {
          let next = s - 1
          while (next >= 0 && actions[next]?.disabled) next--
          return next >= 0 ? next : s
        })
      },
      'action:down': () => {
        const zone = zones[zoneSelected]
        if (!zone) return
        const actions = buildActions(zone)
        setActionSelected((s) => {
          let next = s + 1
          while (next < actions.length && actions[next]?.disabled) next++
          return next < actions.length ? next : s
        })
      },
      'action:run': () => {
        const zone = zones[zoneSelected]
        if (!zone) return
        const actions = buildActions(zone)
        const action = actions[actionSelected]
        if (action && !action.disabled) {
          setActionOpen(false)
          executeAction(action.id, zone)
        }
      },
      'action:back': () => {
        setActionOpen(false)
      },
    },
    { context: 'Action', isActive: view === 'zones' && actionOpen && !tokenEditing },
  )
}
