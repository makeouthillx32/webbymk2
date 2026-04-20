import { homedir } from 'os'
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'path'
import { getPlatform } from './platform.js'

/**
 * Converts a POSIX-style path to a Windows path (e.g., /c/Users/... -> C:\Users\...).
 * Used on Windows to handle paths coming from git or other POSIX-like environments.
 */
function posixPathToWindowsPath(posixPath: string): string {
  // Handle UNC paths: //server/share -> \\server\share
  if (posixPath.startsWith('//')) {
    return posixPath.replace(/\//g, '\\')
  }
  // Handle /cygdrive/c/... format
  const cygdriveMatch = posixPath.match(/^\/cygdrive\/([A-Za-z])(\/|$)/)
  if (cygdriveMatch) {
    const driveLetter = cygdriveMatch[1]!.toUpperCase()
    const rest = posixPath.slice(('/cygdrive/' + cygdriveMatch[1]).length)
    return driveLetter + ':' + (rest || '\\').replace(/\//g, '\\')
  }
  // Handle /c/... format (MSYS2/Git Bash)
  const driveMatch = posixPath.match(/^\/([A-Za-z])(\/|$)/)
  if (driveMatch) {
    const driveLetter = driveMatch[1]!.toUpperCase()
    const rest = posixPath.slice(2)
    return driveLetter + ':' + (rest || '\\').replace(/\//g, '\\')
  }
  // Already Windows or relative — just flip slashes
  return posixPath.replace(/\//g, '\\')
}

/**
 * Expands a path that may contain tilde notation (~) to an absolute path.
 *
 * On Windows, POSIX-style paths are automatically converted to Windows format.
 * The function always returns paths in the native format for the current platform.
 */
export function expandPath(path: string, baseDir?: string): string {
  // Set default baseDir to process.cwd() if not provided
  const actualBaseDir = baseDir ?? process.cwd()

  if (typeof path !== 'string') {
    throw new TypeError(`Path must be a string, received ${typeof path}`)
  }

  // Security: Check for null bytes
  if (path.includes('\0') || (actualBaseDir && actualBaseDir.includes('\0'))) {
    throw new Error('Path contains null bytes')
  }

  const trimmedPath = path.trim()
  if (!trimmedPath) {
    return normalize(actualBaseDir).normalize('NFC')
  }

  // Handle home directory notation
  if (trimmedPath === '~') {
    return homedir().normalize('NFC')
  }

  if (trimmedPath.startsWith('~/')) {
    return join(homedir(), trimmedPath.slice(2)).normalize('NFC')
  }

  // On Windows, convert POSIX-style paths to Windows format
  let processedPath = trimmedPath
  if (getPlatform() === 'windows' && trimmedPath.match(/^\/[a-z]\//i)) {
    processedPath = posixPathToWindowsPath(trimmedPath)
  }

  // Handle absolute paths
  if (isAbsolute(processedPath)) {
    return normalize(processedPath).normalize('NFC')
  }

  // Handle relative paths
  return resolve(actualBaseDir, processedPath).normalize('NFC')
}

/**
 * Checks if a path contains directory traversal patterns that navigate to parent directories.
 */
export function containsPathTraversal(path: string): boolean {
  return /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(path)
}

/**
 * Normalizes a path for use as a JSON config key (consistent forward slashes).
 */
export function normalizePathForConfigKey(path: string): string {
  const normalized = normalize(path)
  return normalized.replace(/\\/g, '/')
}

/**
 * Checks if two paths are equal after normalization.
 */
export function pathsEqual(path1: string, path2: string): boolean {
  if (path1 === path2) return true
  try {
    const norm1 = normalize(expandPath(path1)).toLowerCase()
    const norm2 = normalize(expandPath(path2)).toLowerCase()
    return norm1 === norm2
  } catch {
    return false
  }
}
