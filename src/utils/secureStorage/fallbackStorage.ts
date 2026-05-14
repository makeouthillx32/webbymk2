/**
 * src/utils/secureStorage/fallbackStorage.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps two SecureStorageProviders in a try-primary-then-secondary chain.
 *
 * Why this exists:
 *   macOS Keychain is the ideal credential store, but when you SSH into a Mac
 *   or run unaxis from a cron job, the Keychain is locked and throws. Without
 *   a fallback you'd lose all credential access in headless contexts.
 *
 *   FallbackStorage catches any error from the primary provider and silently
 *   retries with the secondary (file) provider. The TUI never crashes because
 *   Keychain is unavailable.
 *
 * Read vs write fallback:
 *   get()    — tries primary; on error, tries secondary
 *   set()    — writes to BOTH providers so they stay in sync. If primary
 *              fails, write still succeeds via secondary.
 *   delete() — deletes from both; failures are suppressed individually
 *   getAll() — merges both; primary values win on key conflict
 *
 * Usage:
 *   const store = createFallbackStorage(macOsKeychainStorage, fileStorage)
 *   // Currently: createFallbackStorage(fileStorage, fileStorage) is a no-op
 *   // but the wiring is ready for when macOsKeychainStorage is implemented.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { SecureStorageProvider } from './types.js'

/**
 * Creates a storage provider that tries `primary` first and falls back
 * to `secondary` on any thrown error.
 */
export function createFallbackStorage(
  primary:   SecureStorageProvider,
  secondary: SecureStorageProvider,
): SecureStorageProvider {
  return {
    async get(key: string): Promise<string | null> {
      try {
        const value = await primary.get(key)
        if (value !== null) return value
      } catch {
        // Primary unavailable (e.g. Keychain locked) — fall through
      }
      try {
        return await secondary.get(key)
      } catch {
        return null
      }
    },

    async set(key: string, value: string): Promise<void> {
      // Write to both so they stay in sync.
      // If primary fails we still persist to secondary.
      const errors: unknown[] = []

      try {
        await primary.set(key, value)
      } catch (err) {
        errors.push(err)
      }

      try {
        await secondary.set(key, value)
      } catch (err) {
        errors.push(err)
      }

      // Both failed — surface the primary error
      if (errors.length === 2) throw errors[0]
    },

    async delete(key: string): Promise<void> {
      // Best-effort delete from both — suppress individual failures
      await Promise.allSettled([
        primary.delete(key),
        secondary.delete(key),
      ])
    },

    async getAll(): Promise<Record<string, string>> {
      let primaryData:   Record<string, string> = {}
      let secondaryData: Record<string, string> = {}

      try { primaryData   = await primary.getAll()   } catch { /* unavailable */ }
      try { secondaryData = await secondary.getAll() } catch { /* unavailable */ }

      // Merge: secondary provides the base, primary values win on conflict
      return { ...secondaryData, ...primaryData }
    },
  }
}
