/**
 * Lightweight state management for the TUI engine.
 * Decoupled from claude-code's global state.
 */

let lastInteractionTime = Date.now();

/**
 * Updates the last interaction time to current.
 * Used by the engine to prioritize event batching and idle detection.
 */
export function flushInteractionTime(): void {
  lastInteractionTime = Date.now();
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
export function getSessionTrustAccepted(): boolean {
  return false;
}
