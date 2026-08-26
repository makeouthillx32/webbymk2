import { z } from 'zod/v4'

/**
 * Lazily construct a Zod schema to break circular import chains.
 *
 * Bun's bundler needs a real module here; the old helper was missing, which
 * caused the TUI build to die before it even reached the app code.
 */
export function lazySchema<T extends z.ZodTypeAny>(factory: () => T): T {
  return z.lazy(factory) as T
}
