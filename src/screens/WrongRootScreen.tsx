/**
 * WrongRootScreen.tsx - recovery screen for invalid startup directory.
 *
 * Shown before any operational system initializes when rootGuard determines
 * the cwd is not a valid UNAXIS project root. Nothing else mounts.
 *
 * Behavior:
 *   detected root found  -> [enter] re-exec from detected root, [q] exit
 *   no root found        -> [r] rescan, [q] exit, show manual guidance
 *   [r] rescanning       -> re-runs detectProjectRoot(), updates display
 */

import React, { useState, useCallback } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { spawn } from 'child_process'
import { detectProjectRoot, missingMarkers } from '../utils/rootGuard.js'
import { gracefulShutdownSync } from '../utils/gracefulShutdown.js'

type ScreenState =
  | { phase: 'idle' }
  | { phase: 'rescanning' }
  | { phase: 'relaunching' }

export function WrongRootScreen() {
  const { exit } = useApp()

  const [rootState, setRootState] = useState(() => detectProjectRoot())
  const [screen, setScreen] = useState<ScreenState>({ phase: 'idle' })

  const detected = !rootState.valid ? rootState.detected : null
  const missing = missingMarkers(process.cwd())

  const doRelaunch = useCallback(() => {
    if (detected === null) return
    setScreen({ phase: 'relaunching' })
    // Spawn a fresh process from the detected root, then exit this one.
    // The new process inherits the same terminal session.
    spawn(process.execPath, process.argv.slice(1), {
      cwd: detected,
      stdio: 'inherit',
      detached: false,
    })
    setTimeout(() => gracefulShutdownSync(0), 100)
  }, [detected])

  const doRescan = useCallback(() => {
    setScreen({ phase: 'rescanning' })
    setTimeout(() => {
      setRootState(detectProjectRoot())
      setScreen({ phase: 'idle' })
    }, 300)
  }, [])

  useInput((input, key) => {
    if (screen.phase !== 'idle') return
    if (input === 'q' || key.escape) { gracefulShutdownSync(0); return }
    if (key.return && detected !== null) { doRelaunch(); return }
    if (input === 'r') { doRescan(); return }
  })

  if (screen.phase === 'relaunching') {
    return (
      <Box paddingY={1} flexDirection="column">
        <Text color="cyan">Relaunching from {detected}...</Text>
      </Box>
    )
  }

  if (screen.phase === 'rescanning') {
    return (
      <Box paddingY={1}>
        <Text dimColor>Scanning for project root...</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>

      <Text bold color="yellow">Wrong Project Root</Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Current directory:</Text>
        <Text>  {process.cwd()}</Text>
      </Box>

      {missing.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Missing markers:</Text>
          {missing.map(m => (
            <Text key={m} color="red">  x  {m}</Text>
          ))}
        </Box>
      )}

      {detected !== null ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Detected root:</Text>
          <Text color="green">  {detected}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text>[<Text bold>enter</Text>]  relaunch from detected root</Text>
            <Text>[<Text bold>r</Text>]      rescan</Text>
            <Text>[<Text bold>q</Text>]      exit</Text>
          </Box>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          <Text color="red">No valid UNAXIS project root found.</Text>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Navigate to the project directory and run:</Text>
            <Text color="cyan">  unaxis</Text>
            <Box marginTop={1}>
              <Text>[<Text bold>r</Text>]  rescan  [<Text bold>q</Text>]  exit</Text>
            </Box>
          </Box>
        </Box>
      )}

    </Box>
  )
}
