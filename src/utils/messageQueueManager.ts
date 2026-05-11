/**
 * messageQueueManager - priority op queue for unt.ink infrastructure.
 *
 * Holds pending background operations (zone builds, DB lifecycle, snapshots)
 * that are waiting to be dispatched. Exposes a tiny subscribe/snapshot API
 * so the Ink-local hook can react to queue changes without owning queue state.
 *
 * Priority order: 'now' > 'next' > 'later'
 *   now   - urgent stops / cancellations
 *   next  - normal user-triggered ops (build, restart, backup)
 *   later - low-urgency work (verify, snapshot, cleanup)
 *
 * Nothing in this module starts or executes ops - it only stores and orders
 * them. Execution is handled by useOpQueueProcessor in the hook layer.
 */

import { createSignal } from './signal.js'

// Types

export type QueuePriority = 'now' | 'next' | 'later'

export type QueuedOp = {
  id?:        string           // optional stable id for deduplication
  label:      string           // display title shown in overlay / stack
  priority?:  QueuePriority    // defaults to 'next'
  payload?:   unknown          // anything the executor needs (zone, instance, etc.)
  createdAt?: number           // ms since epoch; set automatically on enqueue
}

// Internal state

const PRIORITY_ORDER: Record<QueuePriority, number> = {
  now:   0,
  next:  1,
  later: 2,
}

const opQueue: QueuedOp[] = []
let snapshot: readonly QueuedOp[] = Object.freeze([])
const queueChanged = createSignal()

// Helpers

function normalizeOp(op: QueuedOp): QueuedOp {
  return {
    ...op,
    priority:  op.priority  ?? 'next',
    createdAt: op.createdAt ?? Date.now(),
  }
}

function priorityOf(op: QueuedOp): number {
  return PRIORITY_ORDER[op.priority ?? 'next']
}

function notifySubscribers(): void {
  snapshot = Object.freeze([...opQueue])
  queueChanged.emit()
}

function findBestIndex(filter?: (op: QueuedOp) => boolean): number {
  let bestIndex    = -1
  let bestPriority = Infinity
  for (let i = 0; i < opQueue.length; i++) {
    const op = opQueue[i]!
    if (filter && !filter(op)) continue
    const p = priorityOf(op)
    if (p < bestPriority) { bestIndex = i; bestPriority = p }
  }
  return bestIndex
}

function inPriorityOrder(ops: QueuedOp[]): QueuedOp[] {
  return ops
    .map((op, i) => ({ op, i }))
    .sort((a, b) => priorityOf(a.op) - priorityOf(b.op) || a.i - b.i)
    .map(x => x.op)
}

// Subscription interface

export const subscribeToOpQueue = queueChanged.subscribe
export const getOpQueueSnapshot = (): readonly QueuedOp[] => snapshot

// Read API

export const getOpQueue       = (): QueuedOp[] => [...opQueue]
export const getOpQueueLength = (): number      => opQueue.length
export const hasQueuedOps     = (): boolean     => opQueue.length > 0

export function peek(filter?: (op: QueuedOp) => boolean): QueuedOp | undefined {
  if (opQueue.length === 0) return undefined
  const idx = findBestIndex(filter)
  return idx === -1 ? undefined : opQueue[idx]
}

// Write API

export function enqueue(op: QueuedOp): boolean {
  const normalized = normalizeOp(op)
  // If a stable id is provided, skip silently if an identical id is already
  // queued. Prevents duplicate zone builds / DB ops when a key is held down
  // or the same action is triggered twice before the first run completes.
  if (normalized.id !== undefined) {
    if (opQueue.some(existing => existing.id === normalized.id)) return false
  }
  opQueue.push(normalized)
  notifySubscribers()
  return true
}

export function dequeue(filter?: (op: QueuedOp) => boolean): QueuedOp | undefined {
  if (opQueue.length === 0) return undefined
  const idx = findBestIndex(filter)
  if (idx === -1) return undefined
  const [op] = opQueue.splice(idx, 1)
  notifySubscribers()
  return op
}

export function dequeueAll(): QueuedOp[] {
  if (opQueue.length === 0) return []
  const ops = inPriorityOrder([...opQueue])
  opQueue.length = 0
  notifySubscribers()
  return ops
}

export function dequeueAllMatching(predicate: (op: QueuedOp) => boolean): QueuedOp[] {
  const matched: QueuedOp[]   = []
  const remaining: QueuedOp[] = []
  for (const op of opQueue) {
    ;(predicate(op) ? matched : remaining).push(op)
  }
  if (matched.length === 0) return []
  opQueue.length = 0
  opQueue.push(...remaining)
  notifySubscribers()
  return inPriorityOrder(matched)
}

export function remove(opsToRemove: QueuedOp[]): void {
  if (opsToRemove.length === 0) return
  const before = opQueue.length
  for (let i = opQueue.length - 1; i >= 0; i--) {
    if (opsToRemove.includes(opQueue[i]!)) opQueue.splice(i, 1)
  }
  if (opQueue.length !== before) notifySubscribers()
}

export function removeByFilter(predicate: (op: QueuedOp) => boolean): QueuedOp[] {
  const removed: QueuedOp[] = []
  for (let i = opQueue.length - 1; i >= 0; i--) {
    if (predicate(opQueue[i]!)) removed.unshift(opQueue.splice(i, 1)[0]!)
  }
  if (removed.length > 0) notifySubscribers()
  return inPriorityOrder(removed)
}

export function clearOpQueue(): void {
  if (opQueue.length === 0) return
  opQueue.length = 0
  notifySubscribers()
}

/** Re-emit without mutating; useful if an executor needs to re-trigger after
 *  an external state change (e.g. anyBusy flipped to false). */
export function recheckOpQueue(): void {
  if (opQueue.length === 0) return
  notifySubscribers()
}
