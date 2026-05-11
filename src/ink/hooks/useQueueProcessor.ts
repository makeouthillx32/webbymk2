/**
 * useOpQueueProcessor - React hook that drains the op queue when the TUI is idle.
 *
 * Lives in src/ink/hooks/ (not src/hooks/) so its "react" import resolves to
 * src/ink/node_modules/react -- the same React instance Ink's reconciler uses.
 * Hooks from the top-level react package throw "resolveDispatcher() is null"
 * when called inside an Ink render tree.
 *
 * Drains the queue whenever all three conditions are met:
 *   1. queryGuard is not active  (no op already dispatching)
 *   2. isUiBusy is false         (no overlay / wizard consuming the screen)
 *   3. queue is non-empty
 */

import { useEffect, useRef, useState } from 'react'
import type { QueuedOp }          from '../../utils/messageQueueManager.js'
import { getOpQueueSnapshot, subscribeToOpQueue } from '../../utils/messageQueueManager.js'
import type { QueryGuard }        from '../../utils/QueryGuard.js'
import { processQueueIfReady }    from '../../utils/queueProcessor.js'

// Types

type UseOpQueueProcessorParams = {
  executeQueuedOp: (op: QueuedOp) => Promise<void>
  isUiBusy: boolean
  queryGuard: QueryGuard
}

// Hook

export function useOpQueueProcessor({
  executeQueuedOp,
  isUiBusy,
  queryGuard,
}: UseOpQueueProcessorParams): void {
  const [isGuardActive, setIsGuardActive] = useState(() => queryGuard.getSnapshot())
  const [queueSnapshot, setQueueSnapshot] = useState(() => getOpQueueSnapshot())

  const guardRef = useRef(queryGuard)
  guardRef.current = queryGuard

  useEffect(() => {
    setIsGuardActive(guardRef.current.getSnapshot())
    return guardRef.current.subscribe(() => {
      setIsGuardActive(guardRef.current.getSnapshot())
    })
  }, [queryGuard])

  useEffect(() => {
    setQueueSnapshot(getOpQueueSnapshot())
    return subscribeToOpQueue(() => {
      setQueueSnapshot(getOpQueueSnapshot())
    })
  }, [])

  useEffect(() => {
    if (isGuardActive)              return
    if (isUiBusy)                   return
    if (queueSnapshot.length === 0) return
    if (!queryGuard.reserve())      return

    const result = processQueueIfReady({
      executeOp: async op => {
        const generation = queryGuard.tryStart()
        try {
          await executeQueuedOp(op)
        } catch {
          // absorb -- error handling is the executor's responsibility
        } finally {
          if (generation !== null) queryGuard.end(generation)
        }
      },
    })

    if (!result.processed) queryGuard.cancelReservation()
  }, [queueSnapshot, isGuardActive, executeQueuedOp, isUiBusy, queryGuard])
}
