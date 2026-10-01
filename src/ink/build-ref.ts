// src/ink/build-ref.ts
// ─────────────────────────────────────────────────────────────────────────────
// Builds from a forge commit instead of the dev drive.
//
// `unaxis zone <key> build --ref main` fetches the forge, resolves the ref to a
// commit, and checks that exact commit out — clean, no local edits — into a
// build folder next to the UNAXIS artifact store (a git worktree, so nothing is
// re-downloaded). Docker builds from there. The image is then exactly a commit
// that lives on the forge: reproducible on any machine, never "-dirty".
// Building from the dev drive (no --ref) is unchanged and stays the dev path.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, rmSync } from "fs";
import { dirname, join } from "path";
import { ARTIFACT_STORE_DIR, PROJECT_DIR } from "../config/stack.ts";
import { gitPathArg, runGit } from "./git-bin.ts";

type Line = (l: string) => void;

export type RefSource = {
  dir: string;
  sha: string;
  shortSha: string;
  ref: string;
  commitMsg: string;
  author: string;
  cleanup: () => Promise<void>;
};

export function buildSourceDir(zoneKey: string): string {
  return join(dirname(ARTIFACT_STORE_DIR), "build-src", zoneKey.replace(/[^A-Za-z0-9_-]/g, "-"));
}

/** Candidates in order: the forge's copy of a branch, then anything git can resolve (tag, sha). */
export function refCandidates(ref: string): string[] {
  return /^[0-9a-f]{7,40}$/i.test(ref) ? [ref] : [`origin/${ref}`, ref];
}

export async function checkoutRef(zoneKey: string, ref: string, onLine: Line): Promise<RefSource | null> {
  const git = (args: string[], timeoutMs = 120_000) => runGit(PROJECT_DIR, args, { timeoutMs });

  onLine(`• fetching the forge (origin)…`);
  const fetch = await git(["fetch", "-q", "--prune", "origin"], 300_000);
  if (fetch.status !== 0) onLine(`⚠ fetch failed, using what's already local: ${fetch.stderr.trim().split("\n").pop()}`);

  let sha = "";
  for (const cand of refCandidates(ref)) {
    const r = await git(["rev-parse", "--verify", "-q", `${cand}^{commit}`]);
    if (r.status === 0 && r.stdout.trim()) { sha = r.stdout.trim(); break; }
  }
  if (!sha) { onLine(`✗ "${ref}" isn't a branch, tag or commit on the forge`); return null; }

  const dir = buildSourceDir(zoneKey);
  const gdir = gitPathArg(PROJECT_DIR, dir);
  // A leftover build folder from an earlier run: drop it (it only ever holds
  // a checkout we made) and forget its worktree registration.
  if (existsSync(dir)) {
    await git(["worktree", "remove", "--force", gdir]);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  await git(["worktree", "prune"]);

  onLine(`• checking out ${ref} @ ${sha.slice(0, 8)} into ${dir}`);
  const add = await git(["worktree", "add", "--detach", "-f", gdir, sha], 600_000);
  if (add.status !== 0) { onLine(`✗ checkout failed: ${add.stderr.trim().split("\n").pop()}`); return null; }

  const info = await runGit(dir, ["log", "-1", "--pretty=%h%x00%s%x00%an"]);
  const [shortSha, commitMsg, author] = info.stdout.split("\0").map((s) => s.trim());
  return {
    dir, sha, ref,
    shortSha: shortSha || sha.slice(0, 8),
    commitMsg: commitMsg ?? "",
    author: author || "unknown",
    cleanup: async () => {
      await git(["worktree", "remove", "--force", gdir]);
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    },
  };
}
