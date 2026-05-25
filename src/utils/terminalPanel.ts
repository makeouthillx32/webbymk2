import {
  appendPopoutLines,
  cleanupPopoutFile,
  popoutLogTail,
  popoutOpOutput,
} from './terminalPopout.js'

export {
  appendPopoutLines,
  cleanupPopoutFile,
  popoutLogTail,
  popoutOpOutput,
}

export type TerminalPanel = {
  toggle: () => boolean
}

export function getTerminalPanel(): TerminalPanel {
  return {
    toggle: () => false,
  }
}

export function getTerminalPanelSocket(): string {
  return 'unaxis-popout-terminal'
}
