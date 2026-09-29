// src/ink/zone-changelog.ts
// Derives a human-readable changelog for a zone from data that already
// exists — no new build-time work, no schema changes beyond dbCountLedger.
//
// Every successful `zone <key> build` already writes a deploy_ledger row
// tagged with the source's git-content identity (`g<sha>[-dirty]`, see
// zone-build.ts's gitContentTag()). This walks consecutive ledger rows for
// a zone and diffs their commit range with plain `git log`, so the
// changelog is just "what commits landed between this push and the last
// one" — sourced entirely from the commit messages you already write.
//
// Deliberately simple: no path-filter magic via git pathspec exclude
// (finicky, easy to get subtly wrong); instead each commit's changed files
// are listed and filtered in JS against the same shared-vs-zone-owned
// split documented in the root CLAUDE.md build rules.

import { spawnSync } from "child_process";
import { PROJECT_DIR } from "../config/zones.ts";
import { resolveGitBin } from "./zone-build.ts";

export interface ZoneChangelogCommit {
  sha: string;
  subject: string;
}

export interface ZoneChangelogEntry {
  version: number;
  createdAt: string;
  sourceRef: string;
  dirty: boolean;
  commits: ZoneChangelogCommit[];
}

function runGit(args: string[]): string {
  try {
    const gitBin = resolveGitBin(PROJECT_DIR);
    const r = spawnSync(gitBin, args, { cwd: PROJECT_DIR, encoding: "utf-8", timeout: 2000 });
    return r.status === 0 ? (r.stdout ?? "") : "";
  } catch {
    return "";
  }
}

/** `g<sha>[-dirty]` → `<sha>`, or "" if unparseable (e.g. "gnogit" — no git
 *  was available at build time, nothing to diff against). */
function shaFromSourceRef(ref: string): string {
  const m = /^g([0-9a-f]{4,40})(?:-dirty)?$/i.exec((ref ?? "").trim());
  return m ? m[1] : "";
}

// Mirrors the shared-vs-per-zone split from the root CLAUDE.md: changes
// under a zone's own source only affect that zone; everything else under
// src/ is shared and compiles into every zone image.
function isZoneRelevantPath(path: string, zoneKey: string): boolean {
  if (path.startsWith(`src/zones/${zoneKey}/`)) return true;
  if (path.startsWith(`zones/${zoneKey}/`)) return true;
  if (path.startsWith("src/zones/")) return false; // another zone's own source
  return true; // shared src/, config, etc.
}

const REC_SEP = "\x01";
const FIELD_SEP = "\x02";

/** Commits in (fromSha, toSha], each with the files it touched, filtered to
 *  ones relevant to zoneKey. Empty if either sha is missing/unresolvable. */
function commitsBetween(fromSha: string, toSha: string, zoneKey: string): ZoneChangelogCommit[] {
  if (!fromSha || !toSha || fromSha === toSha) return [];
  const raw = runGit([
    "log",
    `${fromSha}..${toSha}`,
    `--pretty=format:${REC_SEP}%H${FIELD_SEP}%s`,
    "--name-only",
  ]);
  if (!raw) return [];

  return raw
    .split(REC_SEP)
    .slice(1) // leading split is always empty
    .map((chunk) => {
      const [head, ...fileLines] = chunk.split("\n");
      const [sha, subject] = head.split(FIELD_SEP);
      const files = fileLines.map((l) => l.trim()).filter(Boolean);
      return { sha: (sha ?? "").trim(), subject: (subject ?? "").trim(), files };
    })
    // Keep merge commits / commits git reports with no file list too —
    // safer to over-include than to silently drop real history.
    .filter((c) => c.files.length === 0 || c.files.some((f) => isZoneRelevantPath(f, zoneKey)))
    .map((c) => ({ sha: c.sha.slice(0, 8), subject: c.subject }));
}

/**
 * Builds a changelog for `zoneKey` from its deploy_ledger history — newest
 * push first. The oldest entry in the returned window has no prior push in
 * the window to diff against, so it's shown with an empty commit list
 * rather than a wrong/misleading one.
 */
export async function buildZoneChangelog(zoneKey: string, limit = 15): Promise<ZoneChangelogEntry[]> {
  const { dbGetLedger, dbCountLedger } = await import("./control-db.ts");

  const windowDesc = dbGetLedger({ zoneKey, limit }); // newest → oldest
  if (windowDesc.length === 0) return [];

  const chrono = [...windowDesc].reverse(); // oldest → newest
  const total = dbCountLedger(zoneKey);

  const out: ZoneChangelogEntry[] = chrono.map((curr, i) => {
    const prev = i > 0 ? chrono[i - 1] : undefined;
    const currSha = shaFromSourceRef(curr.sourceRef);
    const prevSha = prev ? shaFromSourceRef(prev.sourceRef) : "";
    return {
      version: total - (chrono.length - 1 - i),
      createdAt: curr.createdAt ?? "",
      sourceRef: curr.sourceRef || "—",
      dirty: /-dirty$/i.test(curr.sourceRef || ""),
      commits: prevSha ? commitsBetween(prevSha, currSha, zoneKey) : [],
    };
  });

  return out.reverse(); // newest first, matching the ledger command's convention
}
