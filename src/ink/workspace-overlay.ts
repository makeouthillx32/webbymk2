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
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, lstatSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import ignore from "ignore";

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

export type OverlaySelection = { files: string[]; tooBig: Array<{ path: string; bytes: number }> };

function git(root: string, args: string[], input?: string) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", input, maxBuffer: 256 * 1024 * 1024 });
}

/** Paths (files, or directories ending in "/") the main repo ignores. */
export function mainRepoIgnored(root: string): string[] {
  const r = git(root, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"]);
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
 * excluded directories without descending into them, cap file size.
 */
export function selectOverlayFiles(root: string, ignored = mainRepoIgnored(root)): OverlaySelection {
  const ig = overlayMatcher(root);
  const files: string[] = [];
  const tooBig: OverlaySelection["tooBig"] = [];

  const visit = (rel: string) => {
    const isDir = rel.endsWith("/");
    const clean = isDir ? rel.slice(0, -1) : rel;
    if (ig.ignores(isDir ? `${clean}/` : clean)) return;
    let st;
    try { st = lstatSync(join(root, clean)); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) {
      if (ig.ignores(`${clean}/`)) return;
      let entries: string[] = [];
      try { entries = readdirSync(join(root, clean)); } catch { return; }
      for (const e of entries) visit(`${clean}/${e}${lstatSafeIsDir(join(root, clean, e)) ? "/" : ""}`);
      return;
    }
    if (!st.isFile()) return;
    if (st.size > MAX_FILE_BYTES) { tooBig.push({ path: clean, bytes: st.size }); return; }
    files.push(clean);
  };

  for (const rel of ignored) visit(rel);
  files.sort();
  return { files, tooBig };
}

function lstatSafeIsDir(p: string): boolean {
  try { return lstatSync(p).isDirectory(); } catch { return false; }
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
