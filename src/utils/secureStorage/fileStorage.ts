/**
 * src/utils/secureStorage/fileStorage.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Plain-text JSON storage backend for UnaxisCredentials.
 *
 * File location (in priority order):
 *   1. UNAXIS_CONFIG_DIR env var            (CI, Docker, testing)
 *   2. %USERPROFILE%\.unaxis\              (Windows)
 *   3. ~/.unaxis/                          (Linux / macOS fallback)
 *
 * Security:
 *   - File is created with mode 0o600 (owner read/write only).
 *   - On Windows, chmod is best-effort — files in %USERPROFILE% are
 *     already protected by the OS ACL for the current user.
 *   - Writes are atomic: data goes to a .tmp file first, then renamed
 *     over the real file. A crash mid-write leaves .tmp behind, never
 *     a corrupt .credentials.json.
 *   - All reads are wrapped in try/catch — a corrupt or missing file
 *     returns {} rather than crashing the TUI.
 *
 * This file is intentionally synchronous (for bootstrap compatibility)
 * but exposes an async interface so callers are future-proof if we
 * switch to an async backend (Keychain, secrets manager, etc.).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  chmodSync,
} from 'fs'
import { basename, dirname, join, resolve } from 'path'
import { homedir }       from 'os'
import type { SecureStorageProvider } from './types.js'

// ── Config directory resolution ───────────────────────────────────────────────

/**
 * Resolve the UNAXIS config directory.
 *
 * Override via UNAXIS_CONFIG_DIR for CI, Docker, or isolated test runs:
 *   UNAXIS_CONFIG_DIR=/tmp/unaxis-ci unaxis --version
 */
export function getConfigDir(): string {
  const override = process.env['UNAXIS_CONFIG_DIR']?.trim()
  if (override) return resolve(override)

  const home =
    process.env['USERPROFILE'] ??    // Windows
    process.env['HOME']         ??   // Linux / macOS
    homedir()

  return join(home, '.unaxis')
}

/** Full path to the credentials file. */
export function getCredentialsPath(): string {
  return join(getConfigDir(), '.credentials.json')
}

/** Full path to the settings file (non-secret). */
export function getSettingsPath(): string {
  return join(getConfigDir(), 'settings.json')
}

// ── Internal read/write helpers ───────────────────────────────────────────────

function readJson(filePath: string): Record<string, string> {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
  } catch {
    // Missing file, corrupt JSON, or permission error — treat as empty.
  }
  return {}
}

function writeJsonAtomic(filePath: string, data: Record<string, string>): void {
  const dir     = dirname(filePath)
  const tmpPath = join(dir, `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`)

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Write to .tmp first (atomic swap pattern)
  const content = JSON.stringify(data, null, 2) + '\n'
  writeFileSync(tmpPath, content, { mode: 0o600 })

  // chmod is critical on Linux/macOS — strips group/other read access.
  // On Windows this is a best-effort flag (ACL is handled by the OS).
  try { chmodSync(tmpPath, 0o600) } catch { /* Windows — ignore */ }

  // Atomic rename: if this process crashes here, .tmp is left behind but
  // .credentials.json is never partially written.
  renameSync(tmpPath, filePath)

  // chmod the final file too in case rename preserved old permissions.
  try { chmodSync(filePath, 0o600) } catch { /* Windows — ignore */ }
}

// ── FileStorageProvider ───────────────────────────────────────────────────────

/**
 * Creates a SecureStorageProvider backed by a local JSON file.
 *
 * @param filePath - Absolute path to the JSON store. Defaults to
 *   the canonical credentials file (~/.unaxis/.credentials.json).
 */
export function createFileStorage(
  filePath = getCredentialsPath(),
): SecureStorageProvider {
  return {
    async get(key: string): Promise<string | null> {
      const data = readJson(filePath)
      const value = data[key]
      return typeof value === 'string' && value.length > 0 ? value : null
    },

    async set(key: string, value: string): Promise<void> {
      const data = readJson(filePath)
      data[key] = value
      writeJsonAtomic(filePath, data)
    },

    async delete(key: string): Promise<void> {
      const data = readJson(filePath)
      delete data[key]
      writeJsonAtomic(filePath, data)
    },

    async getAll(): Promise<Record<string, string>> {
      return readJson(filePath)
    },
  }
}

// ── Settings store (non-secret, separate file) ────────────────────────────────

/**
 * A plain (non-secret) settings store backed by settings.json.
 * This file does NOT use 0o600 — it is safe to back up or version-control
 * without leaking secrets.
 */
export function createSettingsStorage(
  filePath = getSettingsPath(),
): SecureStorageProvider {
  // Identical to file storage but writes settings.json without chmod 600.
  function readSettings(): Record<string, string> {
    return readJson(filePath)
  }

  function writeSettings(data: Record<string, string>): void {
    const dir     = dirname(filePath)
    const tmpPath = join(dir, `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', { mode: 0o644 })
    try { chmodSync(tmpPath, 0o644) } catch { /* Windows — ignore */ }
    renameSync(tmpPath, filePath)
    try { chmodSync(filePath, 0o644) } catch { /* Windows — ignore */ }
  }

  return {
    async get(key)         { return readSettings()[key] ?? null },
    async set(key, value)  { const d = readSettings(); d[key] = value; writeSettings(d) },
    async delete(key)      { const d = readSettings(); delete d[key]; writeSettings(d) },
    async getAll()         { return readSettings() },
  }
}
