/**
 * ExitFlow.tsx - terminal-native shutdown UX.
 *
 * Lightweight exit message shown during graceful shutdown.
 * Intentionally minimal — this is a signal to the user that the runtime
 * is shutting down cleanly, not an error state.
 *
 * Usage (from within src/ink/ render boundary):
 *   import { ExitFlow } from '../../components/ExitFlow'
 *   // render as the final frame before process.exit()
 *
 * NOTE: This component uses Ink primitives. It must be imported from within
 * the src/ink/ React-18 isolation boundary to render correctly.
 */

import React from 'react'
import { Box, Text } from '../ink/runtimeInk.js'

export type ExitFlowProps = {
  message?: string
}

export function ExitFlow({ message = 'UNAXIS shutting down' }: ExitFlowProps) {
  return (
    <Box paddingY={1}>
      <Text dimColor>{message}</Text>
    </Box>
  )
}
