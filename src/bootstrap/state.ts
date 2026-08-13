/**
 * Lightweight state management for the TUI engine.
 * Decoupled from donor global state.
 */

let lastInteractionTime = Date.now();

/**
 * Updates the last interaction time to current.
 * Used by the engine to prioritize event batching and idle detection.
 */
export function flushInteractionTime(): void {
  lastInteractionTime = Date.now();
}

export function updateLastInteractionTime(): void {
  flushInteractionTime();
}

/**
 * Gets the timestamp of the last keyboard/mouse interaction.
 */
export function getLastInteractionTime(): number {
  return lastInteractionTime;
}

// Stubs for engine compatibility if needed
export function getSessionId(): string {
  return 'standalone-session';
}

export function setLastAPIRequest(): void {}
export function setLastAPIRequestMessages(): void {}

// Added for slowOperations.ts / env.ts compatibility
export function addSlowOperation(_description: string, _duration: number): void {}
export function getOriginalCwd(): string {
  return process.cwd();
}
export function getCwdState(): string {
  return process.cwd();
}
export function getSessionTrustAccepted(): boolean {
  return false;
}
export function getInlinePlugins(): string[] {
  return [];
}

// Scroll activity suppression — signals background intervals (IDE poll, LSP
// poll, GCS fetch, orphan check) to skip their next tick during scroll drain.
// Prevents >100ms frame gaps when background work competes for the event loop.
let scrollActiveUntil = 0;
export function markScrollActivity(): void {
  scrollActiveUntil = Date.now() + 150;
}
export function isScrollActive(): boolean {
  return Date.now() < scrollActiveUntil;
}

// ── UNAXIS runtime identity ──────────────────────────────────────────────────
// Populated once by src/main.tsx before render(). Never mutated by React.
// Any module can call getRuntime() without prop threading.

export type RuntimeState = {
  originalCwd:  string         // cwd at process start, before any chdir
  projectRoot:  string         // validated UNAXIS project root
  rootValid:    boolean        // false triggers WrongRootScreen
  detectedRoot: string | null  // nearest valid root if rootValid=false
  startedAt:    number         // Date.now() at bootstrap
}

let _runtime: RuntimeState | null = null

export function initRuntimeState(state: RuntimeState): void {
  if (_runtime !== null) return  // idempotent — only first caller wins
  _runtime = state
}

export function getRuntimeState(): RuntimeState | null {
  return _runtime
}

export function getRuntime(): RuntimeState {
  if (_runtime === null) {
    throw new Error('[unaxis] Runtime not initialized. Call initRuntimeState() before getRuntime().')
  }
  return _runtime
}
