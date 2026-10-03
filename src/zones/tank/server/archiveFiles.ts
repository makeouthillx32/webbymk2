// src/zones/tank/server/archiveFiles.ts
// The archive's files live on the archive volume (TANK_ARCHIVE_LOCAL_ROOT), not
// in Supabase; the database is only the index. Index rows can outlive their
// files — the segment hook's 7-day retention prune deletes date folders, and a
// volume that isn't really mounted (Docker showing a 128 MB scratch disk where
// the NAS should be, 2026-10) has nothing on it — so nothing is offered for
// playback without checking the file is actually there.

import { readdir } from "node:fs/promises";
import { dirname, join, normalize, sep, basename } from "node:path";

export const ARCHIVE_ROOT = process.env.TANK_ARCHIVE_LOCAL_ROOT || "/archive";

/** A stored path as a real file under the archive root; null if it would escape it. */
export function resolveWithinArchive(storagePath: string): string | null {
  const full = normalize(join(ARCHIVE_ROOT, storagePath));
  if (full !== ARCHIVE_ROOT && !full.startsWith(ARCHIVE_ROOT + sep)) return null;
  return full;
}

/**
 * Which of these stored paths exist. One directory listing per folder rather
 * than a stat per file: a day is hundreds of segments in a handful of folders,
 * and the archive volume can be a network share.
 */
export async function existingArchivePaths(paths: readonly string[]): Promise<Set<string>> {
  const byDir = new Map<string, string[]>();
  for (const p of paths) {
    const full = resolveWithinArchive(p);
    if (!full) continue;
    const dir = dirname(full);
    (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push(p);
  }
  const found = new Set<string>();
  await Promise.all(
    [...byDir].map(async ([dir, stored]) => {
      let names: Set<string>;
      try {
        names = new Set(await readdir(dir));
      } catch {
        return; // folder gone: none of its files exist
      }
      for (const p of stored) if (names.has(basename(p))) found.add(p);
    }),
  );
  return found;
}
