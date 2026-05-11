/**
 * WelcomeScreen.tsx - startup/welcome ownership layer.
 *
 * Future responsibilities:
 *   - ASCII branding / runtime identity
 *   - Runtime mode display (dev / prod / recovery)
 *   - Startup status (root, env, proxy, Docker)
 *   - Project root display
 *   - Environment information
 *
 * V1: not wired into startup flow yet. Placeholder for future welcome
 * screen evolution separate from the operational zones/db panels.
 *
 * NOTE: This component uses Ink primitives. It must be imported from within
 * the src/ink/ React-18 isolation boundary to render correctly.
 */

import React from 'react'
import { Box, Text } from 'ink'
import { getRuntime } from '../bootstrap/state.js'

export function WelcomeScreen() {
  let root = ''
  try { root = getRuntime().projectRoot } catch { root = process.cwd() }

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text bold>UNAXIS</Text>
      <Text dimColor>{root}</Text>
    </Box>
  )
}
