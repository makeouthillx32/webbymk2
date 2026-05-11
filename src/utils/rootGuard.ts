/**
 * rootGuard.ts - synchronous project-root validation for UNAXIS.
 *
 * Discovery order (first valid result wins):
 *   1. Required markers present in process.cwd()
 *   2. Walk upward from cwd until markers found
 *   3. Saved projectRoot in %APPDATA%\unenter\config.json
 *
 * Required markers (all three must be present):
 *   docker-compose.yml  core infra anchor
 *   .env                runtime credentials anchor
 *   src/ink/            UNAXIS TUI presence
 *
 * Supporting markers (diagnostics only):
 *   .git/  package.json  src/config/zones.ts
 *
 * Config fallback reads ONLY the projectRoot field — never credentials.
 * Config path is always validated against required markers before use.
 */

import { existsSync, readFileSync } from "fs"
import { join, dirname, resolve } from "path"
import { homedir } from "os"

// Types

export type RootState =
  | { valid: true;  root: string }
  | { valid: false; detected: string | null }

type UnaxisConfig = { projectRoot?: string }

const REQUIRED_MARKERS = [
  "docker-compose.yml",
  ".env",
  "src/ink",
] as const

const SUPPORTING_MARKERS = [
  ".git",
  "package.json",
  "src/config/zones.ts",
] as const

// Internal helpers

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

/**
 * Reads only the projectRoot field from the local config.
 * Never touches credentials. Returns null on any failure.
 */
function readConfigProjectRoot(): string | null {
  try {
    const appData = process.env["APPDATA"] ?? join(homedir(), ".config")
    const configPath = join(appData, "unenter", "config.json")
    if (!existsSync(configPath)) return null
    const raw = JSON.parse(readFileSync(configPath, "utf-8")) as UnaxisConfig
    const root = raw.projectRoot
    return typeof root === "string" && root.length > 0 ? root : null
  } catch {
    return null
  }
}

// Public API

/**
 * Detects a valid UNAXIS project root from three sources in order:
 *   1. process.cwd() has all required markers -> { valid: true, root }
 *   2. Walk upward from cwd finds markers    -> { valid: false, detected }
 *   3. config.json projectRoot is valid      -> { valid: false, detected }
 *   4. Nothing found                         -> { valid: false, detected: null }
 *
 * Sources 2-4 all return valid=false so the runtime cannot silently start
 * from a wrong cwd without explicit user confirmation (WrongRootScreen).
 */
export function detectProjectRoot(): RootState {
  const cwd = process.cwd()

  // Source 1: cwd is correct
  if (hasRequiredMarkers(cwd)) return { valid: true, root: cwd }

  // Source 2: walk upward from cwd
  const walked = walkUp(dirname(cwd))
  if (walked !== null) return { valid: false, detected: walked }

  // Source 3: saved projectRoot in config.json
  const configRoot = readConfigProjectRoot()
  if (configRoot !== null && hasRequiredMarkers(configRoot)) {
    return { valid: false, detected: configRoot }
  }

  // Nothing found
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
 * Does not read or validate the file.
 */
export function getConfigPath(): string {
  const appData = process.env["APPDATA"] ?? join(homedir(), ".config")
  return join(appData, "unenter", "config.json")
}
