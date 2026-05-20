import {
  PANEL_TABS,
  type AppState,
  type AppView,
  type BackgroundOperation,
  type PanelTab,
} from './AppStateStore.js'

export { PANEL_TABS, type PanelTab } from './AppStateStore.js'

export function isPanelView(view: AppView): view is PanelTab {
  return (PANEL_TABS as readonly string[]).includes(view)
}

export function statusPollingActive(view: AppView): boolean {
  return view === 'welcome' || view === 'core' || view === 'zones'
}

export function getOverlayOp(
  bgOps: readonly BackgroundOperation[],
  overlayOpId: number | null,
): BackgroundOperation | null {
  if (overlayOpId === null) return null
  return bgOps.find(op => op.id === overlayOpId) ?? null
}

export function getActiveStackOp(
  bgOps: readonly BackgroundOperation[],
  stackFocusId: number | null,
): BackgroundOperation | null {
  if (stackFocusId === null) return null
  return bgOps.find(op => op.id === stackFocusId) ?? null
}

export function getStackCounts(bgOps: readonly BackgroundOperation[]) {
  return {
    running: bgOps.filter(op => op.busy && !op.dismissable).length,
    live: bgOps.filter(op => op.busy && op.dismissable).length,
    done: bgOps.filter(op => !op.busy).length,
  }
}

export function anyBusy(bgOps: readonly BackgroundOperation[]): boolean {
  return bgOps.some(op => op.busy)
}

export function selectCurrentView(state: AppState): AppView {
  return state.navigation.view
}

export function selectOverlayOp(state: AppState): BackgroundOperation | null {
  return getOverlayOp(state.bgOps, state.overlay.overlayOpId)
}

export function selectActiveStackOp(state: AppState): BackgroundOperation | null {
  return getActiveStackOp(state.bgOps, state.stack.stackFocusId)
}
