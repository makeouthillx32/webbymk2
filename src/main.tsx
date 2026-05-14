/**
 * src/main.tsx - UNAXIS runtime bootstrap entrypoint.
 *
 * Startup sequence:
 *   1. Record original cwd
 *   2. Resolve project root (rootGuard) -- auto-chdir if needed
 *   3. Load .env from project root into process.env
 *   4. Initialize runtime singleton
 *   5. Delegate to src/ink/App.tsx
 */

import { detectProjectRoot }                       from './utils/rootGuard.js'
import { initRuntimeState }                        from './bootstrap/state.js'
import { profileCheckpoint, flushStartupProfile }  from './utils/startupProfiler.js'
import { ensureRuntimeEnv }                        from './utils/runtimeEnv.js'

// 1. Snapshot original cwd
const originalCwd = process.cwd()

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
  projectRoot:  effectiveRoot,
  rootValid:    true,
  detectedRoot: null,
  startedAt:    Date.now(),
})

profileCheckpoint('state-init')

// 5. Delegate to Ink render layer
import('./ink/App.tsx').then(() => {
  profileCheckpoint('ink-imported')
  flushStartupProfile()
})
