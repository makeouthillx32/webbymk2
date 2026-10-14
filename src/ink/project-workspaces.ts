// src/ink/project-workspaces.ts
// A project is a record (slug, forge remote, branch); a workspace is one
// checkout of it on one machine. UNAXIS creates workspaces by cloning the
// project from the forge, so a machine needs nothing but UNAXIS and git to get
// a project — not a copy of some special folder.
//
// Pure helpers only; the git + database side is in project-workspaces-store.ts.

/** Folders that make a directory a project checkout (any one is enough). */
export const PROJECT_MARKERS = ["docker-compose.yml", ".infisical.json", "zones"] as const;

export function isProjectCheckout(entries: readonly string[]): boolean {
  const have = new Set(entries);
  return PROJECT_MARKERS.some((m) => have.has(m));
}

/** Slugs become folder names: unenter.live → unenter.live, "My Site" → my-site. */
export function workspaceFolderName(slug: string): string {
  return slug.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

/** Drive-letter form for storage: /mnt/c/Users/x → C:\Users\x; C:/a/b → C:\a\b. */
export function toWindowsPath(p: string): string {
  const mnt = /^\/mnt\/([a-z])(?:\/(.*))?$/.exec(p);
  if (mnt) return `${mnt[1].toUpperCase()}:\\${(mnt[2] ?? "").replace(/\//g, "\\")}`.replace(/\\+$/, "") || `${mnt[1].toUpperCase()}:\\`;
  const win = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (win) return `${win[1].toUpperCase()}:\\${win[2].replace(/\//g, "\\")}`.replace(/\\+$/, "");
  return p;
}

/** A stored path as this process can open it: under WSL, C:\x → /mnt/c/x. */
export function toLocalPath(p: string, platform: string = process.platform): string {
  const win = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (win && platform !== "win32") return `/mnt/${win[1].toLowerCase()}/${win[2].replace(/\\/g, "/")}`.replace(/\/+$/, "");
  return p;
}

/** Forge or other git remote — refuse things git would treat as local paths. */
export function isRemoteUrl(url: string): boolean {
  return /^(ssh|https?|git):\/\//i.test(url) || /^[\w.-]+@[\w.-]+:/.test(url);
}

/** Short workspace id prefixes (as `project workspaces` prints them) resolve to one workspace. */
export function matchWorkspace<T extends { id: string }>(all: readonly T[], prefix: string): T | null {
  const hits = all.filter((w) => w.id.startsWith(prefix));
  return hits.length === 1 ? hits[0] : null;
}
