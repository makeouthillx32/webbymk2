/**
 * src/utils/git.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Git root detection that natively understands worktrees.
 *
 * Normal repo layout:
 *   /project/.git/          <- .git is a directory
 *
 * Worktree layout:
 *   /project-feature/.git   <- .git is a FILE containing:
 *                              "gitdir: /project/.git/worktrees/feature"
 *   /project/.git/worktrees/feature/commondir  <- contains "../.."
 *   /project/.git/          <- the canonical git dir
 *   /project/               <- the canonical repo root
 *
 * This module is intentionally dependency-free (only Node built-ins).
 * It is synchronous so it can be called during bootstrap before any async
 * infrastructure is in place.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readFileSync, statSync } from 'fs'
import { dirname, join, resolve }             from 'path'

// ── Internal ──────────────────────────────────────────────────────────────────

/**
 * Walk up the directory tree from `from`, looking for a `.git` entry
 * (either a directory for normal repos or a file for worktrees).
 * Returns the directory that *contains* `.git`, or null.
 */
function findGitRootImpl(from: string): string | null {
  let current = resolve(from)
  while (true) {
    if (existsSync(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return null   // filesystem root
    current = parent
  }
}

/**
 * Given a directory known to contain a `.git` entry, resolve the
 * canonical main repository root.
 *
 * - If `.git` is a directory  → this IS the canonical root.
 * - If `.git` is a file       → parse the `gitdir:` pointer, then read
 *   the `commondir` file inside the worktree git-dir to follow the
 *   chain back to the main `.git` folder, and return its parent.
 *
 * Never throws — falls back to `gitRoot` on any parse error.
 */
function resolveCanonicalRoot(gitRoot: string): string {
  const gitPath = join(gitRoot, '.git')

  try {
    const s = statSync(gitPath)

    if (s.isDirectory()) {
      // Standard repo — no indirection needed.
      return gitRoot
    }

    if (s.isFile()) {
      // Worktree: .git file contains "gitdir: <path>"
      const content = readFileSync(gitPath, 'utf-8').trim()
      const match   = content.match(/^gitdir:\s*(.+)$/m)
      if (!match) return gitRoot

      // Absolute or relative gitdir path
      const worktreeGitDir = resolve(gitRoot, match[1]!.trim())

      // Inside worktreeGitDir there is a `commondir` file whose content
      // is a path (usually "../..") relative to worktreeGitDir that
      // points to the main repo's .git directory.
      const commondirFile = join(worktreeGitDir, 'commondir')
      if (existsSync(commondirFile)) {
        const commondir  = readFileSync(commondirFile, 'utf-8').trim()
        const mainGitDir = resolve(worktreeGitDir, commondir)
        return dirname(mainGitDir)   // parent of the main .git dir
      }

      // Fallback: worktreeGitDir is like /main/.git/worktrees/<name>
      // Two levels up is the main .git dir, one more is the repo root.
      return dirname(dirname(dirname(worktreeGitDir)))
    }
  } catch {
    // statSync or readFileSync failed — silently fall back.
  }

  return gitRoot
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the directory that contains `.git` (could be a worktree root),
 * or null if not inside any git repository.
 */
export function findGitRoot(from: string): string | null {
  return findGitRootImpl(from)
}

/**
 * Returns the *canonical* main repository root — the one that holds
 * the authoritative `.git` directory — regardless of whether `from`
 * is inside a worktree, a normal repo, or a subdirectory.
 *
 * Returns null if not inside any git repository.
 */
export function findCanonicalGitRoot(from: string): string | null {
  const gitRoot = findGitRootImpl(from)
  if (gitRoot === null) return null
  return resolveCanonicalRoot(gitRoot)
}

/**
 * Returns true if the given directory is a git worktree (i.e. `.git`
 * is a file rather than a directory).
 */
export function isGitWorktree(dir: string): boolean {
  const gitPath = join(dir, '.git')
  if (!existsSync(gitPath)) return false
  try {
    return statSync(gitPath).isFile()
  } catch {
    return false
  }
}
