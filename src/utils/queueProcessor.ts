/**
 * queueProcessor - drains one op at a time from the priority queue.
 *
 * Stateless: no hooks, no React. Call processQueueIfReady() whenever
 * the TUI becomes idle (current op finished, overlay closed, anyBusy false).
 * It dequeues the highest-priority waiting op and hands it to the executor.
 *
 * The executor is whatever calls runOp() inside useBackgroundOps - the
 * queue layer deliberately knows nothing about how ops are executed.
 */

import type { QueuedOp }       from './messageQueueManager.js'
import { dequeue, hasQueuedOps, peek } from './messageQueueManager.js'

// Types

type ProcessParams = {
  /** Called with the dequeued op. Should kick off the actual background work. */
  executeOp: (op: QueuedOp) => Promise<void>
}

type ProcessResult = {
  processed: boolean
}

// API

/**
 * Dequeue the highest-priority pending op and hand it to the executor.
 *
 * Returns { processed: true } when an op was dispatched.
 * Returns { processed: false } when the queue is empty.
 *
 * Typical call sites:
 *   - Inside useBackgroundOps when an op's Promise resolves (op finished)
 *   - Inside useOpQueueProcessor when the queue snapshot changes and the
 *     TUI is idle (anyBusy === false, no overlay open)
 */
export function processQueueIfReady({ executeOp }: ProcessParams): ProcessResult {
  const next = peek()
  if (!next) return { processed: false }

  const op = dequeue()
  if (!op) return { processed: false }

  void executeOp(op)
  return { processed: true }
}

export const hasQueuedWork = hasQueuedOps
