// src/ink/workspace-sync.ts
// ─────────────────────────────────────────────────────────────────────────────
// Git operations for the workspace overlay (see workspace-overlay.ts):
// init, status, and sync (stage the selected files, drop ones that are gone,
// commit, push to the forge). Every git call runs in the project root with
// the overlay's git dir and work tree given as RELATIVE paths, so Windows
// git.exe works from WSL too (it's far faster on a Windows drive), and every
// call is async so the TUI keeps rendering.
// ─────────────────────────────────────────────────────────────────────────────

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { isAbsolute, join } from "path";
import { runGit } from "./git-bin.ts";
import {
  OVERLAY_GIT_DIR,
  isPublicHost,
  removals,
  selectOverlayFiles,
} from "./workspace-overlay.ts";

type Line = (l: string) => void;

const og = (root: string, args: string[], input?: string, timeoutMs = 600_000) =>
  runGit(root, [`--git-dir=${OVERLAY_GIT_DIR}`, "--work-tree=.", ...args], { input, timeoutMs });

export function overlayExists(root: string): boolean {
  return existsSync(join(root, OVERLAY_GIT_DIR, "HEAD"));
}

/**
 * The main repo must never pick the overlay's git dir up as files. Written to
 * the clone's own info/exclude, so it holds on any branch and touches no
 * tracked file (the repo's .gitignore carries the same line once committed).
 */
async function ensureMainIgnoresOverlay(root: string): Promise<boolean> {
  const r = await runGit(root, ["check-ignore", "-q", `${OVERLAY_GIT_DIR}/HEAD`]);
  if (r.status === 0) return false;
  const rel = (await runGit(root, ["rev-parse", "--git-common-dir"])).stdout.trim();
  const common = isAbsolute(rel) || /^[A-Za-z]:[\\/]/.test(rel) ? rel : join(root, rel);
  mkdirSync(join(common, "info"), { recursive: true });
  const exclude = join(common, "info", "exclude");
  const text = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  appendFileSync(exclude, `${text.endsWith("\n") || !text ? "" : "\n"}/${OVERLAY_GIT_DIR}/\n`);
  return true;
}

export async function initOverlay(root: string, remote: string, onLine: Line): Promise<number> {
  if (isPublicHost(remote)) {
    onLine("✗ refusing: the workspace overlay holds secrets and may only live on the forge, never a public host");
    return 2;
  }
  if (!overlayExists(root)) {
    const r = await runGit(root, ["init", "-q", "--bare", "-b", "main", OVERLAY_GIT_DIR]);
    if (r.status !== 0) { onLine(`✗ git init failed: ${r.stderr.trim()}`); return 1; }
    onLine(`✓ created ${OVERLAY_GIT_DIR}/`);
  }
  // Byte-exact secrets (no CRLF conversion), a quiet status, and not bare so
  // --work-tree applies.
  for (const [k, v] of [["core.bare", "false"], ["core.autocrlf", "false"], ["status.showUntrackedFiles", "no"]]) {
    await og(root, ["config", k, v]);
  }
  const has = await og(root, ["remote", "get-url", "origin"]);
  await og(root, has.status === 0 ? ["remote", "set-url", "origin", remote] : ["remote", "add", "origin", remote]);
  if (await ensureMainIgnoresOverlay(root)) onLine(`✓ ${OVERLAY_GIT_DIR}/ excluded from the main repo (info/exclude)`);
  onLine(`✓ overlay remote: ${remote}`);
  return 0;
}

export async function overlayStatus(root: string, onLine: Line): Promise<number> {
  if (!overlayExists(root)) { onLine("workspace overlay: not initialised — run: workspace init --remote <forge url>"); return 1; }
  const remote = (await og(root, ["remote", "get-url", "origin"])).stdout.trim();
  const last = (await og(root, ["log", "-1", "--format=%h %ci %s"])).stdout.trim();
  const tracked = (await og(root, ["ls-files", "-z"])).stdout.split("\0").filter(Boolean).length;
  const ahead = await og(root, ["rev-list", "--count", "origin/main..main"]);
  onLine(`workspace overlay → ${remote}`);
  onLine(`  tracked files  ${tracked}`);
  onLine(`  last snapshot  ${last || "(none)"}`);
  if (ahead.status === 0) onLine(`  unpushed       ${ahead.stdout.trim()} commit(s)`);
  return 0;
}

/**
 * Snapshot the overlay: select files, stage additions/changes, drop files that
 * are gone or are now tracked by the main repo, commit if anything changed,
 * then push. Safe to run as often as wanted; a no-change run makes no commit.
 */
export async function syncOverlay(root: string, onLine: Line, opts: { push?: boolean; message?: string } = {}): Promise<number> {
  if (!overlayExists(root)) { onLine("✗ overlay not initialised — run: workspace init --remote <forge url>"); return 1; }
  const remote = (await og(root, ["remote", "get-url", "origin"])).stdout.trim();
  if (isPublicHost(remote)) { onLine("✗ overlay remote points at a public host — refusing to sync"); return 2; }

  onLine("• selecting ignored files…");
  const { files, tooBig, nestedRepos } = await selectOverlayFiles(root);
  for (const b of tooBig) onLine(`  ⚠ skipped (over 50 MB): ${b.path} (${(b.bytes / 1e6).toFixed(0)} MB)`);
  for (const r of nestedRepos) onLine(`  · skipped nested git repo (has its own history): ${r}`);

  const tracked = (await og(root, ["ls-files", "-z"])).stdout.split("\0").filter(Boolean);
  const drop = removals(tracked, files);
  if (drop.length) {
    const r = await og(root, ["rm", "--cached", "-q", "--ignore-unmatch", "--pathspec-from-file=-", "--pathspec-file-nul"], drop.join("\0"));
    if (r.status !== 0) { onLine(`✗ git rm failed: ${r.stderr.trim().slice(0, 300)}`); return 1; }
  }
  if (files.length) {
    const r = await og(root, ["add", "-f", "--pathspec-from-file=-", "--pathspec-file-nul"], files.join("\0"));
    if (r.status !== 0) { onLine(`✗ git add failed: ${r.stderr.trim().slice(0, 300)}`); return 1; }
  }

  // git silently skips some paths (e.g. inside a repo it treats as embedded);
  // say so instead of claiming they're versioned.
  const nowTracked = new Set((await og(root, ["ls-files", "-z"])).stdout.split("\0").filter(Boolean));
  const dropped = files.filter((f) => !nowTracked.has(f));
  if (dropped.length) {
    onLine(`  ⚠ ${dropped.length} selected file(s) were not added by git, e.g. ${dropped.slice(0, 3).join(", ")}`);
  }

  const changed = (await og(root, ["diff", "--cached", "--name-status"])).stdout.trim().split("\n").filter(Boolean);
  if (changed.length) {
    const name = (await runGit(root, ["config", "user.name"])).stdout.trim() || "unaxis";
    const email = (await runGit(root, ["config", "user.email"])).stdout.trim() || "unaxis@localhost";
    const msg = opts.message ?? `workspace snapshot ${new Date().toISOString().replace(/\.\d+Z$/, "Z")}`;
    const c = await og(root, ["-c", `user.name=${name}`, "-c", `user.email=${email}`, "commit", "-q", "-m", msg]);
    if (c.status !== 0) { onLine(`✗ commit failed: ${c.stderr.trim().slice(0, 300)}`); return 1; }
    const counts: Record<string, number> = {};
    for (const l of changed) counts[l[0]] = (counts[l[0]] ?? 0) + 1;
    onLine(`✓ snapshot: ${nowTracked.size} files tracked (+${counts.A ?? 0} ~${counts.M ?? 0} -${counts.D ?? 0})`);
  } else {
    onLine(`✓ no changes (${nowTracked.size} files tracked)`);
  }

  if (opts.push !== false) {
    const p = await og(root, ["push", "-q", "origin", "main"], undefined, 300_000);
    if (p.status !== 0) { onLine(`✗ push failed: ${p.stderr.trim().slice(0, 300)}`); return 1; }
    onLine(`✓ pushed to ${remote}`);
  }
  return 0;
}
