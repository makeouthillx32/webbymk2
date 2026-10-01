// src/ink/workspace-overlay.ts
// ─────────────────────────────────────────────────────────────────────────────
// The workspace overlay: a second git history over the same project folder
// that holds exactly what the main repo's .gitignore leaves out — .env files,
// secrets, local config, notes, state — minus anything regenerable or too big.
//
//   main repo      → forge `<org>/<repo>`            → push-mirrored to GitHub
//   overlay repo   → forge `<org>/<repo>-workspace`  → never leaves the forge
//
// Its git dir is `.git-workspace/` in the project root (ignored by the main
// repo) and its work tree is the project root itself, so both histories see
// the same files and neither needs history rewriting to keep secrets private.
// Everything here is async so a sync never freezes the TUI.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from "fs";
import { lstat, readdir } from "fs/promises";
import { join } from "path";
import ignore from "ignore";
import { runGit } from "./git-bin.ts";

export const OVERLAY_GIT_DIR = ".git-workspace";
export const OVERLAY_RULES_FILE = ".workspace-overlay";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * gitignore-syntax rules for what the overlay leaves out of the ignored set.
 * A project can add its own in `.workspace-overlay` (tracked by the main repo).
 */
export const DEFAULT_OVERLAY_EXCLUDES = `
# Other git histories — never nest them
.git
.git-workspace/

# Regenerable: installs, builds, caches
node_modules/
.next/
dist/
.venv/
__pycache__/
.turbo/
*.tsbuildinfo
next-env.d.ts

# Runtime output
logs/
*.log
.temp/
.tmp/
*.lock

# Agent worktrees are full repo checkouts
.claude/worktrees/

# Too big for git; kept by their own backup paths
backups/
.ok/local/
*.zip

# Database data inside local Supabase instances (their configs and .env stay)
supabase-instances/*/docker/volumes/db/data/
supabase-instances/*/docker/volumes/storage/
supabase-instances/*/docker/volumes/logs/

# Obsidian plugin code is reinstallable; keep each plugin's settings
.obsidian/plugins/*/*
!.obsidian/plugins/*/data.json
!.obsidian/plugins/*/manifest.json
`;

export type OverlaySelection = {
  files: string[];
  tooBig: Array<{ path: string; bytes: number }>;
  /** Folders that are their own git repos (clones); git won't add files inside them. */
  nestedRepos: string[];
};

/** Paths (files, or directories ending in "/") the main repo ignores. */
export async function mainRepoIgnored(root: string): Promise<string[]> {
  const r = await runGit(root, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"]);
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.stderr.trim()}`);
  return r.stdout.split("\0").filter(Boolean);
}

export function overlayMatcher(root: string) {
  const ig = ignore().add(DEFAULT_OVERLAY_EXCLUDES);
  const extra = join(root, OVERLAY_RULES_FILE);
  if (existsSync(extra)) ig.add(readFileSync(extra, "utf8"));
  return ig;
}

/**
 * Every file the overlay should hold: walk what the main repo ignores, prune
 * excluded directories without descending into them, skip nested repos, cap
 * file size.
 */
export async function selectOverlayFiles(root: string, ignored?: string[]): Promise<OverlaySelection> {
  const ig = overlayMatcher(root);
  const files: string[] = [];
  const tooBig: OverlaySelection["tooBig"] = [];
  const nestedRepos: string[] = [];

  const visit = async (rel: string): Promise<void> => {
    const clean = rel.endsWith("/") ? rel.slice(0, -1) : rel;
    let st;
    try { st = await lstat(join(root, clean)); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) {
      if (ig.ignores(`${clean}/`)) return;
      let entries: string[] = [];
      try { entries = await readdir(join(root, clean)); } catch { return; }
      if (entries.includes(".git")) { nestedRepos.push(clean); return; }
      for (const e of entries) await visit(`${clean}/${e}`);
      return;
    }
    if (!st.isFile() || ig.ignores(clean)) return;
    // Windows device names (a stray `NUL` from a `> NUL` typo, etc.) can't be read as files.
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\.[^/]*)?$/i.test(clean.split("/").pop() ?? "")) return;
    if (st.size > MAX_FILE_BYTES) { tooBig.push({ path: clean, bytes: st.size }); return; }
    files.push(clean);
  };

  for (const rel of ignored ?? (await mainRepoIgnored(root))) await visit(rel);
  files.sort();
  nestedRepos.sort();
  return { files, tooBig, nestedRepos };
}

/** The overlay must only ever live on the forge. */
export function isPublicHost(url: string): boolean {
  return /(^|[@/.])(github\.com|gitlab\.com|bitbucket\.org)([:/]|$)/i.test(url);
}

/** Tracked-but-no-longer-selected paths to drop from the overlay index. */
export function removals(tracked: string[], selected: string[]): string[] {
  const keep = new Set(selected);
  return tracked.filter((p) => !keep.has(p));
}
