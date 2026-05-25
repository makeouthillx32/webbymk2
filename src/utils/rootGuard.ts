/**
 * src/utils/rootGuard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Synchronous project-root detection for UNAXIS.
 *
 * Discovery order (first valid result wins):
 *   1. Git-aware detection — walk up to find .git, resolve the canonical
 *      main-repo root (handles worktrees transparently), verify markers.
 *   2. Marker walk — crawl upward from cwd without git, check markers.
 *   3. Config fallback — read default_project from ~/.unaxis/settings.json,
 *      then legacy projectRoot from %APPDATA%\unenter\config.json.
 *
 * Required markers (all must be present):
 *   docker-compose.yml   core infra anchor
 *   src/ink              UNAXIS TUI presence
 *
 * NOTE: .env is intentionally NOT a required marker. It is .gitignored and
 * will not be present in git worktrees. runtimeEnv.ts loads .env separately
 * after the root is established.
 *
 * Supporting markers (diagnostics only):
 *   .git   .env   package.json   src/config/zones.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readFileSync } from 'fs'
import { join, dirname, resolve }   from 'path'
import { homedir }                  from 'os'
import { findCanonicalGitRoot, isGitWorktree } from './git.js'
import { getSettingsPath } from './secureStorage/fileStorage.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RootState =
  | { valid: true;  root: string }
  | { valid: false; detected: string | null }

type LegacyUnenterConfig = { projectRoot?: string }
type UnaxisSettingsFile = { default_project?: string }

// ── Markers ───────────────────────────────────────────────────────────────────

const REQUIRED_MARKERS = [
  'docker-compose.yml',
  'src/ink',
] as const

const SUPPORTING_MARKERS = [
  '.git',
  '.env',
  'package.json',
  'src/config/zones.ts',
] as const

// ── Internal helpers ──────────────────────────────────────────────────────────

function hasRequiredMarkers(dir: string): boolean {
  return REQUIRED_MARKERS.every(m => existsSync(join(dir, m)))
}

function walkUp(from: string): string | null {
  let current = resolve(from)
  while (true) {
    if (hasRequiredMarkers(current)) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function readJsonFile<T extends object>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T
  } catch {
    return null
  }
}

function readConfigProjectRoot(): string | null {
  const settings = readJsonFile<UnaxisSettingsFile>(getSettingsPath())
  if (typeof settings?.default_project === 'string' && settings.default_project.trim().length > 0) {
    return resolve(settings.default_project.trim())
  }

  try {
    const appData    = process.env['APPDATA'] ?? join(homedir(), '.config')
    const configPath = existsSync(join(appData, 'unaxis', 'unenter', 'config.json'))
      ? join(appData, 'unaxis', 'unenter', 'config.json')
      : join(appData, 'unenter', 'config.json')   // legacy fallback
    const raw  = readJsonFile<LegacyUnenterConfig>(configPath)
    if (!raw) return null
    const root = raw.projectRoot
    return typeof root === 'string' && root.trim().length > 0 ? resolve(root.trim()) : null
  } catch {
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detects a valid UNAXIS project root using four strategies in order.
 *
 * Strategy 1 — Git-aware (handles worktrees):
 *   Walk up to find .git. If .git is a file (worktree), resolve the
 *   canonical main-repo root via the gitdir/commondir chain. Verify
 *   markers on the canonical root.
 *   - If cwd is already at the canonical root with valid markers: valid=true
 *   - If cwd is a worktree/subdir and canonical root has markers: valid=false
 *     so main.tsx knows it needs to chdir there.
 *
 * Strategy 2 — Marker walk (no git):
 *   Crawl upward checking for required markers without git.
 *
 * Strategy 3 — Config fallback:
 *   Read ~/.unaxis/settings.json default_project first, then legacy
 *   %APPDATA%\unenter\config.json projectRoot. Validate markers either way.
 *
 * Strategy 4 — Nothing found: { valid: false, detected: null }
 */
export function detectProjectRoot(): RootState {
  const cwd = process.cwd()

  // ── Strategy 1: Git-aware root resolution ────────────────────────────────
  const canonicalGitRoot = findCanonicalGitRoot(cwd)
  if (canonicalGitRoot !== null && hasRequiredMarkers(canonicalGitRoot)) {
    const cwdIsCanonicalOrSub =
      cwd === canonicalGitRoot ||
      cwd.startsWith(canonicalGitRoot + '/') ||
      cwd.startsWith(canonicalGitRoot + '\\')

    if (cwdIsCanonicalOrSub && hasRequiredMarkers(cwd)) {
      return { valid: true, root: cwd }
    }
    // Worktree or unrelated subdir — canonical root is where we need to be
    return { valid: false, detected: canonicalGitRoot }
  }

  // ── Strategy 2: Blind marker walk ────────────────────────────────────────
  if (hasRequiredMarkers(cwd)) return { valid: true, root: cwd }
  const walked = walkUp(dirname(cwd))
  if (walked !== null) return { valid: false, detected: walked }

  // ── Strategy 3: Config fallback ──────────────────────────────────────────
  const configRoot = readConfigProjectRoot()
  if (configRoot !== null && hasRequiredMarkers(configRoot)) {
    return { valid: false, detected: configRoot }
  }

  // ── Strategy 4: Nothing found ─────────────────────────────────────────────
  return { valid: false, detected: null }
}

/**
 * Returns which required markers are absent from the given directory.
 * Used by WrongRootScreen for diagnostic display.
 */
export function missingMarkers(dir: string): string[] {
  return REQUIRED_MARKERS.filter(m => !existsSync(join(dir, m)))
}

/**
 * Returns which supporting markers are present in the given directory.
 */
export function getSupportingMarkers(dir: string): string[] {
  return SUPPORTING_MARKERS.filter(m => existsSync(join(dir, m)))
}

/**
 * Returns the resolved config path for display/diagnostics.
 */
export function getConfigPath(): string {
  const appData = process.env['APPDATA'] ?? join(homedir(), '.config')
  return join(appData, 'unaxis', 'unenter', 'config.json')
}

/**
 * Returns true if running from inside a git worktree.
 * Useful for surfacing a status indicator in the TUI.
 */
export function isRunningFromWorktree(): boolean {
  const cwd = process.cwd()
  if (isGitWorktree(cwd)) return true
  const gitRoot = findCanonicalGitRoot(cwd)
  if (!gitRoot) return false
  return isGitWorktree(gitRoot)
}
