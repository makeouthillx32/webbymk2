import { lstatSync, realpathSync } from 'fs'
import {
  chmod,
  copyFile,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'fs/promises'
import { dirname, join, relative, sep } from 'path'
import ignore from 'ignore'
import {
  containsPathTraversal,
  expandPath,
  pathsEqual,
} from './path.js'
import { execFileNoThrowWithCwd } from './execFileNoThrow.js'
import { getErrnoCode } from './errors.js'

/**
 * Check if a path exists asynchronously.
 * Useful for validating destination paths before starting a scaffolding process.
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Checks if a directory is empty.
 * @param dirPath The path to the directory to check
 * @returns true if the directory is empty or does not exist, false otherwise
 */
export async function isDirEmpty(dirPath: string): Promise<boolean> {
  try {
    const files = await readdir(dirPath)
    return files.length === 0
  } catch (e: unknown) {
    return getErrnoCode(e) === 'ENOENT'
  }
}

/**
 * Recursively copy a directory. 
 * Optimized for zone making; properly resolves symlinks to avoid creating
 * recursive chains or leaking files outside the destination.
 */
export async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })

  const entries = await readdir(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath)
    } else if (entry.isSymbolicLink()) {
      const linkTarget = await readlink(srcPath)

      // Resolve the symlink to get the actual target path
      // This prevents circular symlinks when src and dest overlap
      let resolvedTarget: string
      try {
        resolvedTarget = await realpath(srcPath)
      } catch {
        // Broken symlink - copy the raw link target as-is
        await symlink(linkTarget, destPath)
        continue
      }

      // Resolve the source directory to handle symlinked source dirs
      let resolvedSrc: string
      try {
        resolvedSrc = await realpath(src)
      } catch {
        resolvedSrc = src
      }

      // Check if target is within the source tree
      const srcPrefix = resolvedSrc.endsWith(sep) ? resolvedSrc : resolvedSrc + sep
      if (resolvedTarget.startsWith(srcPrefix) || resolvedTarget === resolvedSrc) {
        // Target is within source tree - create relative symlink
        const targetRelativeToSrc = relative(resolvedSrc, resolvedTarget)
        const destTargetPath = join(dest, targetRelativeToSrc)
        const relativeLinkPath = relative(dirname(destPath), destTargetPath)
        await symlink(relativeLinkPath, destPath)
      } else {
        // Target is outside source tree - use absolute resolved path
        await symlink(resolvedTarget, destPath)
      }
    }
  }
}

/**
 * Writes to a file and flushes it to disk atomically.
 * It will try an atomic write first, falling back to a regular write if atomic fails.
 * Perfect for generating specific zone configuration files where corruption is unacceptable.
 */
export async function writeFileAtomic(
  filePath: string,
  content: string,
  options: { encoding?: BufferEncoding; mode?: number } = { encoding: 'utf-8' }
): Promise<void> {
  let targetPath = filePath

  // Resolve target if it's a symlink
  try {
    const linkTarget = await readlink(filePath)
    const expanded = expandPath(linkTarget, dirname(filePath))
    targetPath = expanded
  } catch {
    // Not a symlink or doesn't exist
  }

  const tempPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`
  let targetMode: number | undefined
  let targetExists = false

  try {
    const stats = await stat(targetPath)
    targetMode = stats.mode
    targetExists = true
  } catch (e: unknown) {
    if (getErrnoCode(e) !== 'ENOENT') throw e
    if (options.mode !== undefined) {
      targetMode = options.mode
    }
  }

  try {
    const writeOptions: any = { encoding: options.encoding || 'utf-8', flush: true }
    if (!targetExists && options.mode !== undefined) {
      writeOptions.mode = options.mode
    }

    await writeFile(tempPath, content, writeOptions)

    // Apply original permissions back to the temp file
    if (targetExists && targetMode !== undefined) {
      await chmod(tempPath, targetMode)
    }

    // Atomic rename (mostly atomic on POSIX, overwrites on Windows)
    await rename(tempPath, targetPath)
  } catch (atomicError) {
    // Clean up temp file
    try {
      if (await pathExists(tempPath)) {
        await unlink(tempPath)
      }
    } catch {
      // Ignore cleanup error
    }

    // Fallback to non-atomic write
    const fallbackOptions: any = { encoding: options.encoding || 'utf-8', flush: true }
    if (!targetExists && options.mode !== undefined) {
      fallbackOptions.mode = options.mode
    }
    await writeFile(targetPath, content, fallbackOptions)
  }
}

/**
 * Copy gitignored files specified in .worktreeinclude from base repo to worktree.
 *
 * Only copies files that are BOTH:
 * 1. Matched by patterns in .worktreeinclude (uses .gitignore syntax)
 * 2. Gitignored (not tracked by git)
 *
 * Uses `git ls-files --others --ignored --exclude-standard --directory` to list
 * gitignored entries with fully-ignored dirs collapsed to single entries.
 */
export async function copyWorktreeIncludeFiles(
  repoRoot: string,
  worktreePath: string,
): Promise<string[]> {
  let includeContent: string
  try {
    includeContent = await readFile(join(repoRoot, '.worktreeinclude'), 'utf-8')
  } catch {
    return []
  }

  const patterns = includeContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
  if (patterns.length === 0) {
    return []
  }

  // Find git executable - assuming it's in PATH for this simplified version
  const gitExe = 'git'

  // Single pass with --directory: collapses fully-gitignored dirs
  const gitignored = await execFileNoThrowWithCwd(
    gitExe,
    ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'],
    { cwd: repoRoot },
  )
  if (gitignored.code !== 0 || !gitignored.stdout.trim()) {
    return []
  }

  const entries = gitignored.stdout.trim().split('\n').filter(Boolean)
  const matcher = ignore().add(includeContent)

  const collapsedDirs = entries.filter(e => e.endsWith('/'))
  const files = entries.filter(e => !e.endsWith('/') && matcher.ignores(e))

  // Handle directory expansion if selective files inside a gitignored dir are included
  const dirsToExpand = collapsedDirs.filter(dir => {
    if (
      patterns.some(p => {
        const normalized = p.startsWith('/') ? p.slice(1) : p
        if (normalized.startsWith(dir)) return true
        const globIdx = normalized.search(/[*?[]/)
        if (globIdx > 0) {
          const literalPrefix = normalized.slice(0, globIdx)
          if (dir.startsWith(literalPrefix)) return true
        }
        return false
      })
    )
      return true
    if (matcher.ignores(dir.slice(0, -1))) return true
    return false
  })

  if (dirsToExpand.length > 0) {
    const expanded = await execFileNoThrowWithCwd(
      gitExe,
      [
        'ls-files',
        '--others',
        '--ignored',
        '--exclude-standard',
        '--',
        ...dirsToExpand,
      ],
      { cwd: repoRoot },
    )
    if (expanded.code === 0 && expanded.stdout.trim()) {
      for (const f of expanded.stdout.trim().split('\n').filter(Boolean)) {
        if (matcher.ignores(f)) {
          files.push(f)
        }
      }
    }
  }

  const copied: string[] = []
  for (const relativePath of files) {
    // Security check: prevent traversal
    if (containsPathTraversal(relativePath)) continue

    const srcPath = join(repoRoot, relativePath)
    const destPath = join(worktreePath, relativePath)
    try {
      await mkdir(dirname(destPath), { recursive: true })
      await copyFile(srcPath, destPath)
      copied.push(relativePath)
    } catch (e: unknown) {
      // Failed to copy individual file - skip
    }
  }

  return copied
}

/**
 * Safely resolves a file path, handling symlinks and errors gracefully.
 */
export function safeResolvePath(filePath: string): { resolvedPath: string; isSymlink: boolean; isCanonical: boolean } {
  // Block UNC paths
  if (filePath.startsWith('//') || filePath.startsWith('\\\\')) {
    return { resolvedPath: filePath, isSymlink: false, isCanonical: false }
  }

  try {
    const stats = lstatSync(filePath)
    if (stats.isFIFO() || stats.isSocket() || stats.isCharacterDevice() || stats.isBlockDevice()) {
      return { resolvedPath: filePath, isSymlink: false, isCanonical: false }
    }

    const resolvedPath = realpathSync(filePath)
    return {
      resolvedPath,
      isSymlink: resolvedPath !== filePath,
      isCanonical: true,
    }
  } catch (_error) {
    return { resolvedPath: filePath, isSymlink: false, isCanonical: false }
  }
}
