import { writeSync } from 'fs'
import { onExit } from 'signal-exit'
import {
  DISABLE_KITTY_KEYBOARD,
  DISABLE_MODIFY_OTHER_KEYS,
} from '../ink/termio/csi.js'
import {
  DBP,
  DFE,
  DISABLE_MOUSE_TRACKING,
  EXIT_ALT_SCREEN,
  SHOW_CURSOR,
} from '../ink/termio/dec.js'

type Timer = ReturnType<typeof setTimeout>

export type ShutdownSignal = 'SIGINT' | 'SIGTERM' | 'SIGHUP' | 'manual'

export type GracefulShutdownOptions = {
  finalMessage?: string
  failsafeTimeoutMs?: number
}

const DEFAULT_FAILSAFE_TIMEOUT_MS = 5000
const MIN_FAILSAFE_TIMEOUT_MS = 1000
const CLEAR_TERMINAL_TITLE = '\x1b]0;\x07'

let setupComplete = false
let shutdownInProgress = false
let terminalCleaned = false
let failsafeTimer: Timer | undefined
let pendingShutdown: Promise<void> | undefined

// ── Shutdown hook registry ───────────────────────────────────────────────────
// Hooks run in LIFO order (last registered, first called) before terminal
// cleanup. Used by useBackgroundOps to kill log processes and drain the queue.
type ShutdownHookFn = () => void
const shutdownHooks: ShutdownHookFn[] = []

export function registerShutdownHook(fn: ShutdownHookFn): void {
  shutdownHooks.push(fn)
}

function runShutdownHooks(): void {
  // LIFO: reverse iterate so last-registered runs first
  for (let i = shutdownHooks.length - 1; i >= 0; i--) {
    try { shutdownHooks[i]!() } catch { /* hooks must not throw */ }
  }
}

function isEnvTruthy(value: string | boolean | undefined): boolean {
  if (!value) return false
  if (typeof value === 'boolean') return value
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase().trim())
}

function unrefTimer(timer: Timer): void {
  const maybeNodeTimer = timer as Timer & { unref?: () => void }
  maybeNodeTimer.unref?.()
}

function getFailsafeTimeoutMs(options?: GracefulShutdownOptions): number {
  return Math.max(
    MIN_FAILSAFE_TIMEOUT_MS,
    options?.failsafeTimeoutMs ?? DEFAULT_FAILSAFE_TIMEOUT_MS,
  )
}

function writeFinalMessage(message: string | undefined): void {
  if (!message) return
  try {
    writeSync(2, `${message}\n`)
  } catch {
    // stderr may already be closed during terminal teardown.
  }
}

/**
 * Reset terminal modes synchronously before process exit.
 *
 * This intentionally avoids app/session hooks: it only writes terminal reset
 * sequences that are safe no-ops when unsupported by the current terminal.
 */
export function cleanupTerminalModes(): void {
  if (terminalCleaned || !process.stdout.isTTY) {
    return
  }

  terminalCleaned = true

  // Restore stdin to cooked mode so the terminal is usable after exit.
  // Without this, the terminal stays in raw mode and appears frozen.
  try {
    const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => void }
    if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
      stdin.setRawMode(false)
    }
  } catch (_) { /* ignore — stdin may already be closed */ }

  try {
    writeSync(
      1,
      DISABLE_MOUSE_TRACKING +
        EXIT_ALT_SCREEN +
        DISABLE_MODIFY_OTHER_KEYS +
        DISABLE_KITTY_KEYBOARD +
        DFE +
        DBP +
        SHOW_CURSOR,
    )

    if (!isEnvTruthy(process.env.UNENTER_DISABLE_TERMINAL_TITLE)) {
      if (process.platform === 'win32') {
        process.title = ''
      } else {
        writeSync(1, CLEAR_TERMINAL_TITLE)
      }
    }
  } catch {
    // The terminal may already be gone, especially on SIGHUP.
  }
}

function clearFailsafeTimer(): void {
  if (failsafeTimer === undefined) return
  clearTimeout(failsafeTimer)
  failsafeTimer = undefined
}

function forceExit(exitCode: number): never {
  clearFailsafeTimer()

  try {
    process.exit(exitCode)
  } catch (error) {
    if ((process.env.NODE_ENV as string) === 'test') {
      throw error
    }
    process.kill(process.pid, 'SIGKILL')
  }

  if ((process.env.NODE_ENV as string) !== 'test') {
    throw new Error('unreachable')
  }

  return undefined as never
}

function armFailsafe(exitCode: number, options?: GracefulShutdownOptions): void {
  clearFailsafeTimer()
  failsafeTimer = setTimeout(() => {
    cleanupTerminalModes()
    writeFinalMessage(options?.finalMessage)
    forceExit(exitCode)
  }, getFailsafeTimeoutMs(options))
  unrefTimer(failsafeTimer)
}

export function setupGracefulShutdown(
  options: GracefulShutdownOptions = {},
): void {
  if (setupComplete) {
    return
  }
  setupComplete = true

  onExit(() => {
    cleanupTerminalModes()
  })

  process.on('SIGINT', () => {
    void gracefulShutdown(130, 'SIGINT', options)
  })

  process.on('SIGTERM', () => {
    void gracefulShutdown(143, 'SIGTERM', options)
  })

  if (process.platform !== 'win32') {
    process.on('SIGHUP', () => {
      void gracefulShutdown(129, 'SIGHUP', options)
    })
  }
}

export function gracefulShutdownSync(
  exitCode = 0,
  signal: ShutdownSignal = 'manual',
  options?: GracefulShutdownOptions,
): void {
  process.exitCode = exitCode

  pendingShutdown = gracefulShutdown(exitCode, signal, options).catch(() => {
    cleanupTerminalModes()
    writeFinalMessage(options?.finalMessage)
    forceExit(exitCode)
  })
}

export async function gracefulShutdown(
  exitCode = 0,
  _signal: ShutdownSignal = 'manual',
  options?: GracefulShutdownOptions,
): Promise<void> {
  if (shutdownInProgress) {
    return
  }

  shutdownInProgress = true
  process.exitCode = exitCode

  armFailsafe(exitCode, options)
  runShutdownHooks()
  cleanupTerminalModes()
  writeFinalMessage(options?.finalMessage)
  forceExit(exitCode)
}

export function isShuttingDown(): boolean {
  return shutdownInProgress
}

export function resetShutdownState(): void {
  shutdownInProgress = false
  terminalCleaned = false
  clearFailsafeTimer()
  pendingShutdown = undefined
}

export function getPendingShutdownForTesting(): Promise<void> | undefined {
  return pendingShutdown
}
