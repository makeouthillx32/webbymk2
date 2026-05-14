/**
 * src/utils/secureStorage/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Public API for the UNAXIS secure credential and settings stores.
 *
 * Two stores, strict separation:
 *
 *   getCredentialStore()  →  ~/.unaxis/.credentials.json   (mode 0o600)
 *     Secrets only: npm_token, ghcr_token, openai_api_key
 *     Never log. Never commit. Never share.
 *
 *   getSettingsStore()    →  ~/.unaxis/settings.json       (mode 0o644)
 *     Non-secret config: default_project, preferences
 *     Safe to back up or version-control.
 *
 * Config directory:
 *   Default:  ~/.unaxis/          (Linux / macOS)
 *             %USERPROFILE%\.unaxis\  (Windows)
 *   Override: UNAXIS_CONFIG_DIR env var  (CI, Docker, tests)
 *
 * Fallback pattern:
 *   Currently: file-only on all platforms.
 *   Future macOS: createFallbackStorage(keychainStorage, fileStorage)
 *   The FallbackStorage wrapper is available; swap in Keychain when
 *   macOsKeychainStorage.ts is implemented.
 *
 * Typed helpers:
 *   getCredential(key)         string | null
 *   setCredential(key, value)  void
 *   getSetting(key)            string | null
 *   setSetting(key, value)     void
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createFileStorage, createSettingsStorage } from './fileStorage.js'
import type { SecureStorageProvider, CredentialKey, SettingKey, UnaxisCredentials, UnaxisSettings } from './types.js'

// Re-export everything callers might need
export type { SecureStorageProvider, CredentialKey, SettingKey, UnaxisCredentials, UnaxisSettings }
export { getConfigDir, getCredentialsPath, getSettingsPath } from './fileStorage.js'

// ── Singleton stores (created lazily, once per process) ───────────────────────

let _credentialStore: SecureStorageProvider | null = null
let _settingsStore:   SecureStorageProvider | null = null

function firstEnvValue(keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return null
}

/**
 * Returns the credential store for this process.
 *
 * Currently: file-only backend (works on all platforms, SSH, CI).
 * Future macOS: swap primary for macOsKeychainStorage and wrap with
 *   createFallbackStorage(keychainStorage, fileStorage).
 */
export function getCredentialStore(): SecureStorageProvider {
  if (_credentialStore) return _credentialStore

  const fileStore = createFileStorage()

  // TODO macOS: const keychainStore = createMacOsKeychainStorage('unaxis')
  // _credentialStore = createFallbackStorage(keychainStore, fileStore)

  // For now: file-only. Keychain can become the primary later:
  // _credentialStore = createFallbackStorage(keychainStore, fileStore)
  _credentialStore = fileStore
  return _credentialStore
}

/**
 * Returns the settings store (non-secret global config).
 */
export function getSettingsStore(): SecureStorageProvider {
  if (_settingsStore) return _settingsStore
  _settingsStore = createSettingsStorage()
  return _settingsStore
}

// ── Typed convenience helpers ─────────────────────────────────────────────────

/** Get a credential by its typed key. Returns null if not set. */
export async function getCredential(key: CredentialKey): Promise<string | null> {
  return getCredentialStore().get(key)
}

/** Persist a credential by its typed key. */
export async function setCredential(key: CredentialKey, value: string): Promise<void> {
  return getCredentialStore().set(key, value)
}

/** Delete a credential. No-op if not set. */
export async function deleteCredential(key: CredentialKey): Promise<void> {
  return getCredentialStore().delete(key)
}

/** Get all stored credentials as a typed partial object. */
export async function getAllCredentials(): Promise<UnaxisCredentials> {
  const raw = await getCredentialStore().getAll()
  return raw as UnaxisCredentials
}

/** Get a setting by its typed key. Returns null if not set. */
export async function getSetting(key: SettingKey): Promise<string | null> {
  return getSettingsStore().get(key)
}

/** Persist a setting by its typed key. */
export async function setSetting(key: SettingKey, value: string): Promise<void> {
  return getSettingsStore().set(key, value)
}

/** Get all stored settings as a typed partial object. */
export async function getAllSettings(): Promise<UnaxisSettings> {
  const raw = await getSettingsStore().getAll()
  return raw as UnaxisSettings
}

// ── Credential resolution with env-var override ───────────────────────────────
// These are the functions runtimeEnv.ts and release.ts should call.
// Priority: process.env override → credential store → null

/**
 * Resolve the npm publish token.
 * Checks NPM_TOKEN and NPM_AUTH_TOKEN env vars first (CI/CD override),
 * then falls back to the credential store.
 */
export async function resolveNpmToken(): Promise<string | null> {
  const envToken = firstEnvValue(['NPM_TOKEN', 'NPM_AUTH_TOKEN'])
  if (envToken) return envToken
  return getCredential('npm_token')
}

/**
 * Resolve the GitHub Container Registry token.
 * Checks GHCR_TOKEN env var first, then credential store.
 */
export async function resolveGhcrToken(): Promise<string | null> {
  const envToken = firstEnvValue(['GHCR_TOKEN'])
  if (envToken) return envToken
  return getCredential('ghcr_token')
}

/**
 * Resolve the default project root.
 * Priority: UNAXIS_PROJECT_ROOT env → UNENTER_PROJECT_ROOT env → settings store
 */
export async function resolveDefaultProject(): Promise<string | null> {
  const envRoot = firstEnvValue([
    'UNAXIS_PROJECT_ROOT',
    'UNENTER_PROJECT_ROOT',
    'PROJECT_ROOT',
  ])
  if (envRoot) return envRoot
  return getSetting('default_project')
}
