// src/ink/build-source.ts
// ─────────────────────────────────────────────────────────────────────────────
// Every zone build publishes the exact source it built to the forge, so any
// image can be traced back to code that lives somewhere other than POWER's
// drive:
//
//   1. refs/unaxis/builds/<zone>/<tag>  — the built tree, even when dirty
//      (`git stash create` snapshots tracked changes without touching the
//      branch, the index, or the working tree)
//   2. the current branch, fast-forward only, when the tree is clean — on main
//      the forge's push mirror carries it on to GitHub
//   3. the workspace overlay (secrets + ignored files), when initialised
//
// All best-effort: a forge outage warns, never fails a production deploy.
// ─────────────────────────────────────────────────────────────────────────────

import { runGit } from "./git-bin.ts";
import { isPublicHost } from "./workspace-overlay.ts";

type Line = (l: string) => void;

export type BuildSourceResult = { ref: string | null; sha: string | null; branchPushed: boolean };

/** Ref names may not contain "@", "..", spaces, or end in ".lock". */
export function buildRefName(zoneKey: string, contentTag: string, now: Date): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/\.+/g, ".").replace(/^[.-]+|[.-]+$/g, "") || "x";
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `refs/unaxis/builds/${safe(zoneKey)}/${safe(contentTag)}-${stamp}`;
}

export async function publishBuildSource(
  root: string,
  zoneKey: string,
  contentTag: string,
  prov: { dirty: boolean; branch: string },
  onLine: Line,
): Promise<BuildSourceResult> {
  const git = (args: string[], timeoutMs = 60_000) => runGit(root, args, { timeoutMs });
  const result: BuildSourceResult = { ref: null, sha: null, branchPushed: false };

  const remote = (await git(["remote", "get-url", "origin"])).stdout.trim();
  if (!remote) { onLine("⚠ source not published: no `origin` remote"); return result; }
  if (isPublicHost(remote)) {
    onLine(`⚠ source not published: origin is a public host (${remote}); point origin at the forge`);
    return result;
  }

  // 1. The exact tree being built.
  let sha = "";
  if (prov.dirty) sha = (await git(["stash", "create", `unaxis build ${zoneKey} ${contentTag}`])).stdout.trim();
  if (!sha) sha = (await git(["rev-parse", "HEAD"])).stdout.trim();
  if (!sha) { onLine("⚠ source not published: no commit to publish"); return result; }
  const ref = buildRefName(zoneKey, contentTag, new Date());
  const push = await git(["push", "-q", "origin", `${sha}:${ref}`]);
  if (push.status === 0) {
    Object.assign(result, { ref, sha });
    onLine(`✓ source ${sha.slice(0, 8)} → forge ${ref}${prov.dirty ? " (includes uncommitted changes)" : ""}`);
  } else {
    onLine(`⚠ could not publish source to the forge: ${push.stderr.trim().split("\n").pop()}`);
  }

  // 2. The branch itself, only when what's built is exactly a commit.
  if (!prov.dirty && prov.branch && prov.branch !== "HEAD") {
    const b = await git(["push", "-q", "origin", `HEAD:refs/heads/${prov.branch}`]);
    if (b.status === 0) {
      result.branchPushed = true;
      onLine(`✓ ${prov.branch} pushed to the forge${prov.branch === "main" ? " (mirrors to GitHub)" : ""}`);
    } else {
      const why = b.stderr.includes("non-fast-forward") || b.stderr.includes("fetch first")
        ? "the forge has commits this workspace doesn't — pull first"
        : b.stderr.trim().split("\n").pop();
      onLine(`⚠ ${prov.branch} not pushed to the forge: ${why}`);
    }
  }
  return result;
}
