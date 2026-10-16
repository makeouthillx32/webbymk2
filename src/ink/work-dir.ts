// src/ink/work-dir.ts
// Where you edit, as opposed to where production's config lives.
//
// "The project folder" used to answer three questions at once:
//   PROJECT_DIR — the deploy root: the control plane's checkout that live
//                 containers bind-mount (compose, proxy-config, mediamtx,
//                 coturn, syslog, kong.yml, supabase-instances, runtime .env).
//                 It must not move under a running stack.
//   workDir()   — the work root: the checkout you edit, run dev mode from and
//                 build with plain `zone build`. It follows the project's
//                 active workspace (`unaxis project use`).
//   UNAXIS's own source (src/ink, templates) stays wherever UNAXIS runs from.
// Until a workspace is chosen, workDir() is PROJECT_DIR — nothing changes.

import { existsSync } from "fs";
import { PROJECT_DIR } from "../config/zones.ts";
import { dbGetProjects, dbGetWorkspaces, type Project } from "./control-db.ts";
import { toLocalPath, toWindowsPath } from "./project-workspaces.ts";

/** The project this UNAXIS manages: the one whose recorded root is PROJECT_DIR, else the first. */
export function currentProject(): Project | null {
  const all = dbGetProjects();
  const here = toWindowsPath(PROJECT_DIR).toLowerCase();
  return all.find((p) => toWindowsPath(p.rootPath).toLowerCase() === here) ?? all[0] ?? null;
}

/** The work root: UNAXIS_WORK_DIR, else the project's active workspace (if it exists here), else PROJECT_DIR. */
export function workDir(): string {
  const forced = process.env.UNAXIS_WORK_DIR;
  if (forced && existsSync(forced)) return forced;
  try {
    const p = currentProject();
    const w = p?.activeWorkspaceId ? dbGetWorkspaces(p.id).find((x) => x.id === p.activeWorkspaceId) : null;
    const local = w ? toLocalPath(w.root) : null;
    if (local && existsSync(local)) return local;
  } catch { /* control DB unavailable — fall back */ }
  return PROJECT_DIR;
}

/** True when you're editing somewhere other than production's config checkout. */
export function workingOutsideDeployRoot(): boolean {
  return toWindowsPath(workDir()).toLowerCase() !== toWindowsPath(PROJECT_DIR).toLowerCase();
}
