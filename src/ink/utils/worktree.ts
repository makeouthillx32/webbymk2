import { existsSync, readFileSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import {
  copyDir,
  copyWorktreeIncludeFiles,
  copyZoneIncludeFiles,
  findCanonicalGitRoot,
  findGitRoot,
  isDirEmpty,
  isGitWorktree,
  pathExists,
  safeResolvePath,
  writeFileAtomic,
} from '../../utils/worktree.js'

export interface WorktreeInfo {
  isWorktree: boolean
  worktreePath: string
  canonicalRoot: string
  worktreeName: string
  commondir?: string
  gitdir?: string
}

/**
 * Inspects a directory path and resolves detailed Git worktree metadata for UNAXIS.
 */
export function getWorktreeInfo(targetDir: string = process.cwd()): WorktreeInfo {
  const resolved = resolve(targetDir)
  const isWorktree = isGitWorktree(resolved)
  const gitRoot = findGitRoot(resolved) ?? resolved
  const canonicalRoot = findCanonicalGitRoot(resolved) ?? gitRoot

  let commondir: string | undefined
  let gitdir: string | undefined

  if (isWorktree) {
    try {
      const gitFilePath = join(gitRoot, '.git')
      const content = readFileSync(gitFilePath, 'utf-8').trim()
      const match = content.match(/^gitdir:\s*(.+)$/m)
      if (match && match[1]) {
        gitdir = resolve(gitRoot, match[1].trim())
        const commondirFile = join(gitdir, 'commondir')
        if (existsSync(commondirFile)) {
          commondir = resolve(gitdir, readFileSync(commondirFile, 'utf-8').trim())
        }
      }
    } catch {
      // Ignore file read error
    }
  }

  return {
    isWorktree,
    worktreePath: gitRoot,
    canonicalRoot,
    worktreeName: basename(gitRoot),
    commondir,
    gitdir,
  }
}

/**
 * Validates that a worktree path is safely associated with the canonical repository root.
 */
export function isWorktreePathSafe(worktreePath: string, canonicalRoot: string): boolean {
  const resolvedWorktree = resolve(worktreePath)
  const resolvedCanonical = resolve(canonicalRoot)
  const worktreeParent = dirname(resolvedWorktree)

  return (
    resolvedWorktree.startsWith(resolvedCanonical) ||
    worktreeParent.startsWith(resolvedCanonical) ||
    getWorktreeInfo(resolvedWorktree).canonicalRoot === resolvedCanonical
  )
}

export {
  copyDir,
  copyWorktreeIncludeFiles,
  copyZoneIncludeFiles,
  findCanonicalGitRoot,
  findGitRoot,
  isDirEmpty,
  isGitWorktree,
  pathExists,
  safeResolvePath,
  writeFileAtomic,
}
