/**
 * src/utils/secureStorage/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared interfaces for the secureStorage subsystem.
 *
 * Design principles:
 *   - SecureStorageProvider is a simple async key/value interface so any
 *     backend (file, keychain, env) is swappable behind the same API.
 *   - UnaxisCredentials holds ONLY secrets — things you would never commit
 *     or share. Use UnaxisSettings for non-secret global config.
 *   - UnaxisSettings holds preferences and pointers — safe to back up,
 *     version-control, or share across machines.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Storage provider interface ────────────────────────────────────────────────

export interface SecureStorageProvider {
  /** Retrieve a single secret by key. Returns null if not found. */
  get(key: string): Promise<string | null>
  /** Store a secret. Creates the store if it does not exist. */
  set(key: string, value: string): Promise<void>
  /** Remove a single secret. No-op if key does not exist. */
  delete(key: string): Promise<void>
  /** Return all stored secrets as a plain object. */
  getAll(): Promise<Record<string, string>>
}

// ── Credential shape (secrets only — never log, never commit) ─────────────────

export interface UnaxisCredentials {
  /** npm publish token — npm_xxx */
  npm_token?:           string
  /** ISO timestamp of when npm_token was last stored */
  npm_token_set_at?:    string
  /** GitHub Container Registry PAT — ghp_xxx */
  ghcr_token?:          string
  /** ISO timestamp of when ghcr_token was last stored */
  ghcr_token_set_at?:   string
  /** OpenAI API key — sk-xxx */
  openai_api_key?:      string
}

// ── Settings shape (non-secret global config) ─────────────────────────────────

export interface UnaxisSettings {
  /**
   * Absolute path to the default project root.
   * Used when unaxis is launched from an unrelated directory with no .git.
   * Example: "Z:\\WEBSITES\\webbymk2"
   */
  default_project?: string

  /**
   * Override for the config directory itself. Normally resolved from
   * UNAXIS_CONFIG_DIR env var or ~/.unaxis — stored here so GUI tools
   * can read it without needing the env var.
   */
  config_dir_override?: string

  /**
   * ISO timestamp of the last successful npm registry update check.
   * Used to throttle checks to once per 24 hours.
   */
  last_update_check?: string
}

// ── Config directory resolution ───────────────────────────────────────────────

/** Keys of UnaxisCredentials — used for type-safe get/set calls. */
export type CredentialKey = keyof UnaxisCredentials

/** Keys of UnaxisSettings — used for type-safe get/set calls. */
export type SettingKey = keyof UnaxisSettings
