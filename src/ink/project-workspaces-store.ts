// src/ink/project-workspaces-store.ts
// Projects and their workspaces, on disk and in the control DB.
//   project set <slug> --remote <url> [--branch main]   where the project's code lives
//   project clone <slug> [--to <dir>] [--branch <b>]    a new checkout from that remote
//   project use <slug> <workspaceId>                    the checkout this machine works in
// See project-workspaces.ts for the model.

import { existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import {
  dbGetProjectBySlug,
  dbGetWorkspaces,
  dbSetActiveWorkspace,
  dbUpsertProject,
  dbUpsertWorkspace,
  type Project,
  type Workspace,
} from "./control-db.ts";
import { runGit } from "./git-bin.ts";
import { ARTIFACT_STORE_DIR } from "../config/stack.ts";
import {
  isProjectCheckout,
  isRemoteUrl,
  matchWorkspace,
  toLocalPath,
  toWindowsPath,
  workspaceFolderName,
} from "./project-workspaces.ts";

type Line = (l: string) => void;

/** Where new checkouts go by default: <home>\unaxis\workspaces. Override with UNAXIS_WORKSPACES_ROOT. */
export function workspacesRoot(): string {
  if (process.env.UNAXIS_WORKSPACES_ROOT) return process.env.UNAXIS_WORKSPACES_ROOT;
  // The person's Windows home, also when the TUI runs in WSL: dev mode and
  // Docker run on the Windows side here. ARTIFACT_STORE_DIR is already
  // resolved to <home>/AppData/Roaming/unaxis/unenter/stacks from either side.
  const m = /^(.*)[\\/]AppData[\\/]Roaming[\\/]/i.exec(ARTIFACT_STORE_DIR);
  const home = m ? m[1] : (process.env.USERPROFILE || process.env.HOME || ".");
  return join(home, "unaxis", "workspaces");
}

/** Branch and commit as git sees them now (the record can go stale). */
async function readCheckout(root: string): Promise<{ branch: string; sourceRef: string } | null> {
  const local = toLocalPath(root);
  if (!existsSync(local)) return null;
  const b = await runGit(local, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const h = await runGit(local, ["rev-parse", "HEAD"]);
  if (b.status !== 0 || h.status !== 0) return null;
  return { branch: b.stdout.trim(), sourceRef: `g${h.stdout.trim().slice(0, 8)}` };
}

export function setProjectSource(slug: string, remote: string, branch: string | undefined, onLine: Line): number {
  const p = dbGetProjectBySlug(slug);
  if (!p) { onLine(`✗ no project "${slug}"`); return 2; }
  if (!isRemoteUrl(remote)) { onLine(`✗ "${remote}" isn't a git remote (ssh://… or https://…)`); return 2; }
  dbUpsertProject({ ...p, gitRemote: remote, defaultBranch: branch ?? p.defaultBranch });
  onLine(`✓ ${slug}: code from ${remote} (${branch ?? p.defaultBranch})`);
  return 0;
}

export async function cloneProject(slug: string, opts: { to?: string; branch?: string }, onLine: Line): Promise<number> {
  const p = dbGetProjectBySlug(slug);
  if (!p) { onLine(`✗ no project "${slug}"`); return 2; }
  if (!isRemoteUrl(p.gitRemote)) { onLine(`✗ ${slug} has no remote — run: project set ${slug} --remote <forge url>`); return 1; }
  const branch = opts.branch ?? p.defaultBranch ?? "main";

  const dest = toLocalPath(opts.to ?? join(workspacesRoot(), workspaceFolderName(slug)));
  if (existsSync(dest) && readdirSync(dest).length > 0) {
    onLine(`✗ ${toWindowsPath(dest)} already exists and isn't empty — pick another with --to`);
    return 1;
  }
  mkdirSync(dirname(dest), { recursive: true });

  onLine(`• cloning ${p.gitRemote} (${branch}) → ${toWindowsPath(dest)}`);
  // native git: Windows git.exe stalls on large pulls from the forge (see git-bin.ts).
  const clone = await runGit(dirname(dest), ["clone", "--branch", branch, p.gitRemote, dest], { timeoutMs: 900_000, native: true });
  if (clone.status !== 0) { onLine(`✗ clone failed: ${clone.stderr.trim().split("\n").pop()}`); return 1; }
  if (!isProjectCheckout(readdirSync(dest))) {
    onLine(`⚠ cloned, but it doesn't look like a project checkout (no ${["docker-compose.yml", ".infisical.json", "zones"].join(" / ")})`);
  }

  const head = (await runGit(dest, ["rev-parse", "HEAD"])).stdout.trim();
  const id = dbUpsertWorkspace({
    projectId: p.id,
    provider: /^[A-Za-z]:\\/.test(toWindowsPath(dest)) ? "local-windows" : "wsl2",
    root: toWindowsPath(dest),
    branch,
    sourceRef: head ? `g${head.slice(0, 8)}` : "",
    lifecycleState: "active",
  });
  onLine(`✓ workspace ${id.slice(0, 8)} for ${slug} at ${toWindowsPath(dest)} (${branch} @ ${head.slice(0, 8)})`);
  if (!p.activeWorkspaceId) {
    dbSetActiveWorkspace(p.id, id);
    onLine(`✓ it's ${slug}'s active workspace on this machine`);
  } else {
    onLine(`  make it the active one: project use ${slug} ${id.slice(0, 8)}`);
  }
  return 0;
}

export async function useWorkspace(slug: string, idPrefix: string, onLine: Line): Promise<number> {
  const p = dbGetProjectBySlug(slug);
  if (!p) { onLine(`✗ no project "${slug}"`); return 2; }
  const w = matchWorkspace(dbGetWorkspaces(p.id), idPrefix);
  if (!w) { onLine(`✗ no single workspace of ${slug} starts with "${idPrefix}" — see: project workspaces`); return 2; }
  const now = await readCheckout(w.root);
  if (!now) { onLine(`✗ ${w.root} isn't a git checkout on this machine`); return 1; }
  dbUpsertWorkspace({ ...w, ...now });
  dbSetActiveWorkspace(p.id, w.id);
  onLine(`✓ ${slug} now works in ${w.root} (${now.branch} @ ${now.sourceRef})`);
  return 0;
}

/** Drop a workspace record; the folder stays unless deleteFolder (and only if it's a clean checkout). */
export async function forgetWorkspace(slug: string, idPrefix: string, deleteFolder: boolean, onLine: Line): Promise<number> {
  const p = dbGetProjectBySlug(slug);
  if (!p) { onLine(`✗ no project "${slug}"`); return 2; }
  const w = matchWorkspace(dbGetWorkspaces(p.id), idPrefix);
  if (!w) { onLine(`✗ no single workspace of ${slug} starts with "${idPrefix}"`); return 2; }
  if (w.id === p.activeWorkspaceId) { onLine(`✗ that's ${slug}'s active workspace — project use another one first`); return 1; }
  if (deleteFolder) {
    const local = toLocalPath(w.root);
    const st = existsSync(local) ? await runGit(local, ["status", "--porcelain"]) : null;
    if (st && (st.status !== 0 || st.stdout.trim())) { onLine(`✗ ${w.root} has uncommitted changes — not deleting it`); return 1; }
    if (st) {
      if (local.startsWith("/mnt/")) {
        // A Windows-drive checkout holds what Windows tools made (bun's
        // junctions, read-only files) and WSL can't delete those (EACCES).
        // Windows' rmdir removes junction links without following them.
        const { spawnSync } = await import("child_process");
        const r = spawnSync("cmd.exe", ["/d", "/c", "rmdir", "/s", "/q", toWindowsPath(local)], { encoding: "utf8", timeout: 600_000 });
        if (existsSync(local)) { onLine(`⚠ couldn't fully delete ${w.root}: ${(r.stderr || r.stdout || "").trim().split("\n").pop()}`); }
      } else {
        rmSync(local, { recursive: true, force: true });
      }
    }
    onLine(`✓ deleted ${w.root}`);
  }
  const { getControlDb } = await import("./control-db.ts");
  getControlDb().run("DELETE FROM workspaces WHERE id = ?", [w.id]);
  onLine(`✓ forgot workspace ${w.id.slice(0, 8)}${deleteFolder ? "" : ` (folder ${w.root} left in place)`}`);
  return 0;
}

/** Each project's workspaces, the active one marked, with whether the folder is really there. */
export function describeWorkspaces(projects: readonly Project[]): string[] {
  const out: string[] = [];
  for (const p of projects) {
    out.push(`${p.slug}  ←  ${p.gitRemote || "no remote"} (${p.defaultBranch})`);
    const ws: Workspace[] = dbGetWorkspaces(p.id);
    if (!ws.length) out.push("    (no workspaces — project clone " + p.slug + ")");
    for (const w of ws) {
      const here = existsSync(toLocalPath(w.root));
      out.push(`  ${w.id === p.activeWorkspaceId ? "●" : "○"} ${w.id.slice(0, 8)}  ${w.root}  ${w.branch || "?"}${w.sourceRef ? ` @ ${w.sourceRef}` : ""}${here ? "" : "  (not on this machine)"}`);
    }
  }
  return out;
}
