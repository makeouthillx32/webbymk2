import { useEffect, useState } from 'react'
import { getWorktreeInfo, type WorktreeInfo } from '../utils/worktree.js'

export interface UseWorktreeOptions {
  cwd?: string
  pollIntervalMs?: number
}

/**
 * React Hook for driving Worktree topology state and awareness in UNAXIS Ink TUI components.
 */
export function useWorktree(options: UseWorktreeOptions = {}): WorktreeInfo {
  const cwd = options.cwd ?? process.cwd()
  const [info, setInfo] = useState<WorktreeInfo>(() => getWorktreeInfo(cwd))

  useEffect(() => {
    setInfo(getWorktreeInfo(cwd))
    if (!options.pollIntervalMs) return

    const timer = setInterval(() => {
      setInfo(getWorktreeInfo(cwd))
    }, options.pollIntervalMs)

    return () => clearInterval(timer)
  }, [cwd, options.pollIntervalMs])

  return info
}

export {
  getWorktreeInfo,
  isWorktreePathSafe,
  type WorktreeInfo,
} from '../utils/worktree.js'
