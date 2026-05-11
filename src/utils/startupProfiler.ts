/**
 * startupProfiler.ts - lightweight startup timing utility.
 * Dev/debug only. No telemetry. No external reporting.
 * Enable: UNAXIS_PROFILE=1
 */

type Checkpoint = { name: string; totalMs: number; deltaMs: number }

const startTime = Date.now()
const checkpoints: Checkpoint[] = []
let lastTime = startTime
let _enabled = process.env["UNAXIS_PROFILE"] === "1"

export function profileCheckpoint(name: string): void {
  if (!_enabled) return
  const now = Date.now()
  checkpoints.push({ name, totalMs: now - startTime, deltaMs: now - lastTime })
  lastTime = now
}

export function flushStartupProfile(): void {
  if (!_enabled || checkpoints.length === 0) return
  const out: string[] = ["[unaxis startup profile]"]
  for (const c of checkpoints) {
    out.push("  +" + c.deltaMs + "ms  (" + c.totalMs + "ms)  " + c.name)
  }
  try { process.stderr.write(out.join("\n") + "\n") } catch {}
  checkpoints.length = 0
}

export function enableStartupProfiler(): void  { _enabled = true }
export function disableStartupProfiler(): void { _enabled = false }
export function isProfilerEnabled(): boolean   { return _enabled }
