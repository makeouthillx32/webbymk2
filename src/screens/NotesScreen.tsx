// src/ink/screens/NotesScreen.tsx
// Placeholder panel. The shape of this page is still being decided.
// For now: shows the active project root and lets you open it in the
// system file explorer.

import React, { useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import { spawn } from 'child_process'
import { getRuntime } from '../bootstrap/state.js'

interface Props {
  onGoBack: () => void
}

export function NotesScreen({ onGoBack }: Props) {
  const runtime = getRuntime()
  const projectRoot = runtime.projectRoot

  const openFolder = useCallback(() => {
    if (process.platform === 'win32') {
      spawn('explorer', [projectRoot], { detached: true, stdio: 'ignore' })
    } else if (process.platform === 'darwin') {
      spawn('open', [projectRoot], { detached: true, stdio: 'ignore' })
    } else {
      spawn('xdg-open', [projectRoot], { detached: true, stdio: 'ignore' })
    }
  }, [projectRoot])

  useInput((input, key) => {
    if (input === 'o') { openFolder(); return }
    if (input === 'q' || key.escape || key.leftArrow) { onGoBack(); return }
  })

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>

      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">Notes</Text>
        <Text dimColor>placeholder</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Project</Text>
        <Text color="green">  {projectRoot}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={2}>
        <Text dimColor>────────────────────────────────────────────────</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>This panel is a work in progress.</Text>
          <Text dimColor>Still deciding what belongs here — scratchpad,</Text>
          <Text dimColor>project links, quick refs, or something else.</Text>
        </Box>
      </Box>

      <Box flexDirection="column">
        <Text>[<Text bold>o</Text>]  open project folder</Text>
        <Text>[<Text bold>q</Text>]  back</Text>
      </Box>

    </Box>
  )
}
