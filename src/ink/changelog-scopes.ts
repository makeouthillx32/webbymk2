// src/ink/changelog-scopes.ts
// Which part of the platform a changed file belongs to, so each part gets
// its own changelog instead of one log for everything:
//
//   zone:<key>  — a zone's own source (src/zones/<key>/, zones/<key>/)
//   core        — shared site code; compiles into EVERY zone image
//   unaxis      — the control plane (TUI, CLI, agents' operator tooling)
//   services    — everything that runs beside the site: workers, agents,
//                 proxy, media, Supabase, compose
//   other       — docs, notes, repo housekeeping (in no changelog)
//
// The TUI and the site share a few folders (src/components, src/hooks,
// src/utils, src/types, src/services). A file there goes by the commit's own
// scope — `fix(unaxis): …` → unaxis, anything else → core — because the
// path alone can't tell KeyHint.tsx (TUI) from Breadcrumbs (site).

export type ScopeKind = "zone" | "core" | "unaxis" | "services" | "other";

/** `name` is the zone key for "zone" and the service name for "services". */
export interface PathScope { kind: ScopeKind; name?: string }

const UNAXIS_DIRS = [
  "src/ink/", "src/entrypoints/", "src/screens/", "src/native-ts/", "src/agent-view/",
  "src/keybindings/", "src/bootstrap/", "src/config/", "src/state/", "src/context/",
  ".agents/skills/unaxis-operator/",
];
const UNAXIS_FILES = new Set([
  "src/main.tsx", "src/replLauncher.tsx", "src/cli.ts", "src/ink.ts", "src/interactiveHelpers.tsx",
  "unaxis.ps1", "unaxis_ipc.py", "ink.ps1", "scripts/dev-bare.ts",
]);

/** Folders both the site and the TUI import from. */
const SHARED_DIRS = ["src/components/", "src/hooks/", "src/utils/", "src/types/", "src/services/"];
const SHARED_FILES = new Set(["src/types.ts"]);

/** services/<name>/ and packages/<name>/ are one service each. */
const SERVICE_PARENTS = ["services/", "packages/"];
/** Top-level folders that are each one service. */
const SERVICE_DIRS = ["proxy", "mediamtx", "coturn", "syslog", "supabase", "swarm-orchestration"];
const SERVICE_FILES: Record<string, string> = { "docker-compose.yml": "compose" };

/** Root files that change what the site image builds. */
const CORE_FILES = new Set([
  "next.config.js", "middleware.ts", "package.json", "bun.lock", "package-lock.json",
  "tailwind.config.ts", "postcss.config.js", "tsconfig.json", "jsconfig.json",
  "next-env.d.ts", "Dockerfile", ".dockerignore",
]);
const CORE_DIRS = ["public/", "i18n/"];

/** Commit scopes that mean "this is control-plane work". */
const UNAXIS_TAGS = new Set(["unaxis", "tui", "ink", "cli"]);

/** `fix(unaxis): …` → "unaxis"; no conventional scope → null. */
export function commitTag(subject: string): string | null {
  const m = /^[a-z]+(?:\(([^)]+)\))?!?:/i.exec(subject.trim());
  return m?.[1]?.trim().toLowerCase() ?? null;
}

export function scopeOfPath(rawPath: string, tag: string | null = null): PathScope {
  const p = rawPath.replace(/\\/g, "/").replace(/^\.\//, "");

  const zone = /^(?:src\/)?zones\/([^/]+)\//.exec(p);
  if (zone) return { kind: "zone", name: zone[1] };

  if (UNAXIS_FILES.has(p) || UNAXIS_DIRS.some((d) => p.startsWith(d))) return { kind: "unaxis" };

  if (SHARED_FILES.has(p) || SHARED_DIRS.some((d) => p.startsWith(d))) {
    return { kind: tag && UNAXIS_TAGS.has(tag) ? "unaxis" : "core" };
  }

  for (const parent of SERVICE_PARENTS) {
    if (p.startsWith(parent)) {
      const name = p.slice(parent.length).split("/")[0];
      if (name && p.length > parent.length + name.length) return { kind: "services", name };
    }
  }
  const top = p.split("/")[0];
  if (p.includes("/") && SERVICE_DIRS.includes(top)) return { kind: "services", name: top };
  if (SERVICE_FILES[p]) return { kind: "services", name: SERVICE_FILES[p] };

  if (p.startsWith("src/") || CORE_FILES.has(p) || CORE_DIRS.some((d) => p.startsWith(d))) return { kind: "core" };

  return { kind: "other" };
}

/** Every scope a commit touches, de-duplicated. */
export function scopesOfCommit(subject: string, files: string[]): PathScope[] {
  const tag = commitTag(subject);
  const seen = new Map<string, PathScope>();
  for (const f of files) {
    const s = scopeOfPath(f, tag);
    seen.set(`${s.kind}:${s.name ?? ""}`, s);
  }
  return [...seen.values()];
}

/** What `unaxis changelog <target>` asks for. */
export type ChangelogTarget =
  | { kind: "zone"; name: string }
  | { kind: "core" | "unaxis" }
  | { kind: "services"; name?: string };

/** Does this commit belong in the target's changelog? Zones include core:
 *  shared code ships in every zone image, so it is part of each zone's history. */
export function commitMatches(target: ChangelogTarget, scopes: PathScope[]): boolean {
  return scopes.some((s) => {
    if (target.kind === "zone") return (s.kind === "zone" && s.name === target.name) || s.kind === "core";
    if (target.kind === "services") return s.kind === "services" && (!target.name || s.name === target.name);
    return s.kind === target.kind;
  });
}
