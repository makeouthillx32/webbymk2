// src/utils/projectRegistry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Known-projects registry — persistent list of UNAXIS project roots.
//
// Stored under the key "known_projects" in settings.json as a JSON-encoded
// array of KnownProject objects.  The same file that holds default_project.
//
// Auto-registration: call ensureCurrentProjectRegistered(path) at TUI startup
// to silently add the active project if it isn't in the list yet.
//
// Future: this registry will power `unaxis <project> <command>` routing,
// letting the CLI address any known project's TUI session by slug.
// ─────────────────────────────────────────────────────────────────────────────

import { basename, resolve } from 'path'
import { getSetting, setSetting } from './secureStorage/index.js'
import { PROJECT_SLUG } from '../config/stack.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KnownProject {
  /** Short filesystem-safe name derived from the directory, e.g. "webbymk2" */
  slug:    string
  /** Absolute, normalized path to the project root */
  path:    string
  /** ISO-8601 timestamp of when this entry was added */
  addedAt: string
}

// ── Settings key ──────────────────────────────────────────────────────────────

const KEY = 'known_projects'

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Canonical comparison key for a project path. On Windows the drive letter
 * case is non-deterministic across runs (`Z:\…` vs `z:\…`), and slashes can
 * vary — so two entries for the SAME directory could compare unequal and get
 * registered twice (producing duplicate slugs → React duplicate-key warnings
 * that smear the alt-screen). Normalize via resolve() + lowercase on win32.
 */
function pathKey(p: string): string {
  const abs = resolve(p)
  return process.platform === 'win32' ? abs.toLowerCase() : abs
}

async function load(): Promise<KnownProject[]> {
  const raw = await getSetting(KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Collapse any pre-existing duplicates (same directory stored under a
    // different drive-letter case / slash style). Keeps the first occurrence.
    const seen = new Set<string>()
    const deduped: KnownProject[] = []
    for (const p of parsed as KnownProject[]) {
      if (!p?.path) continue
      const key = pathKey(p.path)
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(p)
    }
    return deduped
  } catch {
    return []
  }
}

async function save(list: KnownProject[]): Promise<void> {
  await setSetting(KEY, JSON.stringify(list))
}

function slugify(path: string): string {
  // Use the directory name, lowercase, collapse non-alphanum to dashes
  return basename(resolve(path))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'project'
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Return all known projects, in the order they were added. */
export async function getKnownProjects(): Promise<KnownProject[]> {
  return load()
}

/**
 * Add a project root to the registry.
 * No-ops silently if the path is already registered.
 * Returns the (possibly newly created) entry.
 */
export async function addKnownProject(projectPath: string): Promise<KnownProject> {
  const abs  = resolve(projectPath)
  const key  = pathKey(abs)
  const list = await load()
  const existing = list.find((p) => pathKey(p.path) === key)
  if (existing) return existing

  const entry: KnownProject = {
    slug:    slugify(abs),
    path:    abs,
    addedAt: new Date().toISOString(),
  }
  await save([...list, entry])
  return entry
}

/**
 * Remove a project from the registry by slug or exact path.
 * Returns true if something was removed, false if not found.
 */
export async function removeKnownProject(slugOrPath: string): Promise<boolean> {
  const abs  = resolve(slugOrPath)
  const key  = pathKey(abs)
  const list = await load()
  const next = list.filter((p) => p.slug !== slugOrPath && pathKey(p.path) !== key)
  if (next.length === list.length) return false
  await save(next)
  return true
}

/**
 * Ensure the given project path is in the registry, using PROJECT_SLUG as the
 * canonical slug (overrides the directory-name auto-slug).
 *
 * Also fixes up any stale entry for this path that was saved with a different
 * slug (e.g. "webbymk2" → "unenter") so the picker always shows the right name.
 *
 * Safe to call at every TUI startup — silently no-ops if already correct.
 */
export async function ensureCurrentProjectRegistered(projectPath: string): Promise<void> {
  const abs  = resolve(projectPath)
  const key  = pathKey(abs)
  const list = await load()

  const existing = list.find((p) => pathKey(p.path) === key)

  if (existing && existing.slug === PROJECT_SLUG) return   // already correct

  if (existing) {
    // Slug is stale — update it in-place
    const updated = list.map((p) =>
      pathKey(p.path) === key ? { ...p, slug: PROJECT_SLUG } : p
    )
    await save(updated)
    return
  }

  // Not registered yet — add with the canonical slug
  const entry: KnownProject = {
    slug:    PROJECT_SLUG,
    path:    abs,
    addedAt: new Date().toISOString(),
  }
  await save([...list, entry])
}
