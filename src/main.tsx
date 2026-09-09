/**
 * src/main.tsx - UNAXIS runtime bootstrap entrypoint.
 *
 * Startup sequence:
 *   1. Record original cwd
 *   2. Resolve project root (rootGuard) -- auto-chdir if needed
 *   3. Load .env from project root into process.env
 *   4. Initialize runtime singleton
 *   5. Delegate to src/replLauncher.tsx
 */

import { detectProjectRoot } from './utils/rootGuard.js'
import { initRuntimeState } from './bootstrap/state.js'
import { profileCheckpoint, flushStartupProfile } from './utils/startupProfiler.js'
import { ensureRuntimeEnv } from './utils/runtimeEnv.js'

// 1. Snapshot original cwd
const originalCwd = process.cwd()

// Emergency cleanup: ensure terminal escape sequences (mouse tracking, cursor) are always reset
function resetTerminal() {
  if (process.stdout.isTTY) {
    try {
      process.stdout.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?25h')
    } catch {}
  }
}
process.on('exit', resetTerminal)
process.on('uncaughtException', (err) => {
  resetTerminal()
  console.error('\nUNAXIS crashed with uncaught exception:', err)
  process.exit(1)
})

profileCheckpoint('main-start')


// 2. Resolve project root
const rootState = detectProjectRoot()

profileCheckpoint('root-guard-done')

let effectiveRoot: string
if (rootState.valid === true) {
  effectiveRoot = rootState.root
} else {
  const detected = rootState.detected
  if (!detected) {
    process.stderr.write(
      '\n  UNAXIS: no project root found.\n' +
      '  Run from the project directory, or set a default project:\n' +
      '    unaxis config set default_project <path>\n\n'
    )
    process.exit(1)
  }
  process.chdir(detected)
  effectiveRoot = detected
}

// 3. Load .env from project root and normalize runtime aliases.
ensureRuntimeEnv(true)

// 4. Initialize runtime singleton
initRuntimeState({
  originalCwd,
  projectRoot: effectiveRoot,
  rootValid: true,
  detectedRoot: null,
  startedAt: Date.now(),
})

profileCheckpoint('state-init')

// 5. Delegate to the TUI runtime assembly layer.
import('./replLauncher.js').then(async ({ launchRepl }) => {
  await launchRepl()
  profileCheckpoint('ink-imported')
  flushStartupProfile()
})
