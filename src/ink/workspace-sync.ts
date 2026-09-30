// src/ink/workspace-sync.ts
// ─────────────────────────────────────────────────────────────────────────────
// Git operations for the workspace overlay (see workspace-overlay.ts):
// init, status, and sync (stage the selected files, drop ones that are gone,
// commit, push to the forge). Every git call names the overlay's git dir and
// the project root explicitly, so it works the same from Windows or WSL paths.
// ─────────────────────────────────────────────────────────────────────────────

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  OVERLAY_GIT_DIR,
  isPublicHost,
  removals,
  selectOverlayFiles,
} from "./workspace-overlay.ts";

type Line = (l: string) => void;

function og(root: string, args: string[], input?: string) {
  return spawnSync("git", [`--git-dir=${join(root, OVERLAY_GIT_DIR)}`, `--work-tree=${root}`, ...args], {
    cwd: root, encoding: "utf8", input, maxBuffer: 256 * 1024 * 1024,
  });
}

function mainGit(root: string, args: string[]) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

export function overlayExists(root: string): boolean {
  return existsSync(join(root, OVERLAY_GIT_DIR, "HEAD"));
}

/**
 * The main repo must never pick the overlay's git dir up as files. Written to
 * the clone's own info/exclude, so it holds on any branch and touches no
 * tracked file (the repo's .gitignore carries the same line once committed).
 */
function ensureMainIgnoresOverlay(root: string): boolean {
  const r = mainGit(root, ["check-ignore", "-q", `${OVERLAY_GIT_DIR}/HEAD`]);
  if (r.status === 0) return false;
  const common = mainGit(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).stdout.trim();
  const exclude = join(common, "info", "exclude");
  mkdirSync(join(common, "info"), { recursive: true });
  const text = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  appendFileSync(exclude, `${text.endsWith("\n") || !text ? "" : "\n"}/${OVERLAY_GIT_DIR}/\n`);
  return true;
}

export function initOverlay(root: string, remote: string, onLine: Line): number {
  if (isPublicHost(remote)) {
    onLine("✗ refusing: the workspace overlay holds secrets and may only live on the forge, never a public host");
    return 2;
  }
  if (!overlayExists(root)) {
    const r = spawnSync("git", ["init", "-q", "--bare", "-b", "main", join(root, OVERLAY_GIT_DIR)], { encoding: "utf8" });
    if (r.status !== 0) { onLine(`✗ git init failed: ${r.stderr.trim()}`); return 1; }
    onLine(`✓ created ${OVERLAY_GIT_DIR}/`);
  }
  // Byte-exact secrets (no CRLF conversion), a quiet status, and not bare so
  // --work-tree applies.
  for (const [k, v] of [["core.bare", "false"], ["core.autocrlf", "false"], ["status.showUntrackedFiles", "no"]]) {
    og(root, ["config", k, v]);
  }
  const has = og(root, ["remote", "get-url", "origin"]);
  og(root, has.status === 0 ? ["remote", "set-url", "origin", remote] : ["remote", "add", "origin", remote]);
  if (ensureMainIgnoresOverlay(root)) onLine(`✓ added /${OVERLAY_GIT_DIR}/ to .gitignore`);
  onLine(`✓ overlay remote: ${remote}`);
  return 0;
}

export function overlayStatus(root: string, onLine: Line): number {
  if (!overlayExists(root)) { onLine("workspace overlay: not initialised — run: workspace init --remote <forge url>"); return 1; }
  const remote = og(root, ["remote", "get-url", "origin"]).stdout.trim();
  const last = og(root, ["log", "-1", "--format=%h %ci %s"]).stdout.trim();
  const tracked = og(root, ["ls-files"]).stdout.split("\n").filter(Boolean).length;
  const ahead = og(root, ["rev-list", "--count", "origin/main..main"]);
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
export function syncOverlay(root: string, onLine: Line, opts: { push?: boolean; message?: string } = {}): number {
  if (!overlayExists(root)) { onLine("✗ overlay not initialised — run: workspace init --remote <forge url>"); return 1; }
  const remote = og(root, ["remote", "get-url", "origin"]).stdout.trim();
  if (isPublicHost(remote)) { onLine("✗ overlay remote points at a public host — refusing to sync"); return 2; }

  onLine("• selecting ignored files…");
  const { files, tooBig } = selectOverlayFiles(root);
  for (const b of tooBig) onLine(`  ⚠ skipped (over 50 MB): ${b.path} (${(b.bytes / 1e6).toFixed(0)} MB)`);

  const tracked = og(root, ["ls-files", "-z"]).stdout.split("\0").filter(Boolean);
  const drop = removals(tracked, files);
  if (drop.length) {
    const r = og(root, ["rm", "--cached", "-q", "--ignore-unmatch", "--pathspec-from-file=-", "--pathspec-file-nul"], drop.join("\0"));
    if (r.status !== 0) { onLine(`✗ git rm failed: ${r.stderr.trim().slice(0, 300)}`); return 1; }
  }
  if (files.length) {
    const r = og(root, ["add", "-f", "--pathspec-from-file=-", "--pathspec-file-nul"], files.join("\0"));
    if (r.status !== 0) { onLine(`✗ git add failed: ${r.stderr.trim().slice(0, 300)}`); return 1; }
  }

  const changed = og(root, ["diff", "--cached", "--name-status"]).stdout.trim().split("\n").filter(Boolean);
  if (changed.length) {
    const name = mainGit(root, ["config", "user.name"]).stdout.trim() || "unaxis";
    const email = mainGit(root, ["config", "user.email"]).stdout.trim() || "unaxis@localhost";
    const msg = opts.message ?? `workspace snapshot ${new Date().toISOString().replace(/\.\d+Z$/, "Z")}`;
    const c = og(root, ["-c", `user.name=${name}`, "-c", `user.email=${email}`, "commit", "-q", "-m", msg]);
    if (c.status !== 0) { onLine(`✗ commit failed: ${c.stderr.trim().slice(0, 300)}`); return 1; }
    const counts = { A: 0, M: 0, D: 0 } as Record<string, number>;
    for (const l of changed) counts[l[0]] = (counts[l[0]] ?? 0) + 1;
    onLine(`✓ snapshot: ${files.length} files tracked (+${counts.A ?? 0} ~${counts.M ?? 0} -${counts.D ?? 0})`);
  } else {
    onLine(`✓ no changes (${files.length} files tracked)`);
  }

  if (opts.push !== false) {
    const p = og(root, ["push", "-q", "origin", "main"]);
    if (p.status !== 0) { onLine(`✗ push failed: ${p.stderr.trim().slice(0, 300)}`); return 1; }
    onLine(`✓ pushed to ${remote}`);
  }
  return 0;
}
