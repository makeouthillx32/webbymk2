/**
 * prefetch.ts - deferred startup orchestration for UNAXIS.
 *
 * Runs after first paint so it never blocks the initial render.
 * V1: intentionally lightweight — this is the expansion point for future
 * deferred work without disrupting the render-first startup model.
 *
 * Sequencing model:
 *   render()
 *   -> first paint
 *   -> startDeferredPrefetches()   (called from App useEffect or interactiveHelpers)
 *   -> waitUntilExit()
 *   -> graceful shutdown
 *
 * Future candidates for this layer:
 *   - git status / branch detection
 *   - node/service discovery
 *   - proxy health pre-check
 *   - runtime cache warming
 *   - queue hydration from persisted state
 *   - ambient environment validation
 */

import { profileCheckpoint } from '../utils/startupProfiler.js'

let _started = false

export function startDeferredPrefetches(): void {
  if (_started) return
  _started = true

  profileCheckpoint('deferred-prefetch-start')

  // V1: no work yet — placeholder for the above candidates.
  // Add discrete async work here as setImmediate / queueMicrotask calls
  // so each piece can be tracked independently without blocking the event loop.

  profileCheckpoint('deferred-prefetch-done')
}

export function isPrefetchStarted(): boolean {
  return _started
}
