// src/ink/utils/dockerEnv.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared Docker process environment.
//
// Spreads process.env and, on non-Windows hosts, injects the standard
// DOCKER_HOST unix socket so Docker CLI commands resolve correctly.
// Import this instead of redeclaring DOCKER_ENV in each file.
// ─────────────────────────────────────────────────────────────────────────────

import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { PROJECT_DIR } from "../../config/stack.ts";

declare const UNAXIS_VERSION: string | undefined;

function getUnaxisVersion(): string {
  try {
    if (typeof UNAXIS_VERSION === "string" && UNAXIS_VERSION) return UNAXIS_VERSION.trim();
  } catch {}
  try {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, "utf-8")) as { version?: string };
    if (typeof pkg.version === "string" && pkg.version && pkg.version !== "dev") return pkg.version;
  } catch {}
  return "dev";
}

function getGitSourceRef(): string {
  const run = (args: string[]): string => {
    try {
      const r = spawnSync("git", args, { cwd: PROJECT_DIR, encoding: "utf-8" });
      return r.status === 0 ? (r.stdout ?? "").trim() : "";
    } catch { return ""; }
  };
  const fullSha  = run(["rev-parse", "HEAD"]);
  const shortSha = run(["rev-parse", "--short=8", "HEAD"]) || (fullSha ? fullSha.slice(0, 8) : "nogit");
  const dirty = run(["status", "--porcelain"]).length > 0;
  return `g${shortSha}${dirty ? "-dirty" : ""}`;
}

export const DOCKER_ENV: Record<string, string> = {
  ...(process.env as Record<string, string>),
  ...(process.platform !== "win32"
    ? { DOCKER_HOST: "unix:///var/run/docker.sock" }
    : {}),
  UNAXIS_VERSION: getUnaxisVersion(),
  UNAXIS_SOURCE_REF: getGitSourceRef(),
};
