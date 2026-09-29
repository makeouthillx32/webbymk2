// src/config/stack.ts
// ─────────────────────────────────────────────────────────────────────────────
// OWNERSHIP: bootstrap / fallback config only.
//
//   ✓  Static infrastructure constants read from config.json at startup
//   ✓  Synchronous access — safe to call at module init time
//   ✓  Fallback when Supabase is unreachable or environments table is empty
//   ✗  Active environment resolution — that is environment-store.ts
//   ✗  Per-environment coordinates — that is UnaxisEnvironment from Supabase
//   ✗  Secret handling — that is vault.secrets via environment-store.ts
//
// Rule: callers that need the LIVE infrastructure coordinates must get an
// UnaxisEnvironment record from environment-store.ts and read from it directly.
// They must NOT call this file for async resolution — this file is synchronous
// by design.
//
// Config file locations (read once at startup, never written):
//   %APPDATA%\unaxis\unenter\config.json  (Windows — primary)
//   ~/.unaxis/unenter/config.json         (macOS / Linux)
// ─────────────────────────────────────────────────────────────────────────────

import { resolve, join } from "path";
import { readFileSync, existsSync, readdirSync } from "fs";
import { homedir } from "os";

// ── Project root ──────────────────────────────────────────────────────────────

function deriveProjectDir(): string {
  // Explicit override always wins (CI, run.ps1, UNAXIS_PROJECT_ROOT, etc.)
  if (process.env["PROJECT_ROOT"])        return process.env["PROJECT_ROOT"];
  if (process.env["UNAXIS_PROJECT_ROOT"]) return process.env["UNAXIS_PROJECT_ROOT"];

  // In dev mode (bun --watch) import.meta.dir correctly reflects the source
  // file location. In the prod bundle, Bun inlines it as the *build-machine*
  // path, which doesn't exist on installed machines. So in prod we skip it
  // and rely on process.cwd() — main.tsx has already chdir'd to the project
  // root before this module is dynamically imported.
  if (process.env.NODE_ENV !== "production") {
    const dir = (import.meta as any).dir as string | undefined;
    if (dir) return resolve(dir, "../..");
  }

  return process.cwd();
}

export const PROJECT_DIR  = deriveProjectDir();

/**
 * Canonical slug for this project — used in the project picker, pairing keys,
 * and CLI routing.  Overrides the directory-name auto-slug so the TUI always
 * shows "unenter" regardless of where the repo is cloned.
 */
export const PROJECT_SLUG = "unenter.live";

// ── Local config loader ───────────────────────────────────────────────────────

interface LocalConfig {
  /** Root domain for all zones — e.g. "example.com" */
  domain?: string;
  npm: {
    ip:       string;
    port:     number;
    email:    string;
    password: string;
    leEmail?: string;
  };
  stack: {
    ip:        string;
    proxyPort: number;
  };
  ddns?: {
    hostname?: string;
  };
}

function loadLocalConfig(): LocalConfig | null {
  const appData     = process.env["APPDATA"] ?? join(homedir(), ".config");
  const newPath     = join(appData, "unaxis", "unenter", "config.json");
  const legacyPath  = join(appData, "unenter", "config.json");

  // Auto-migrate from legacy path on first run after update.
  const configPath  = existsSync(newPath)    ? newPath
                    : existsSync(legacyPath) ? legacyPath   // legacy fallback
                    : null;

  if (!configPath) return null;

  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as LocalConfig;
  } catch {
    throw new Error(
      `Failed to parse local config at ${configPath}\n` +
      `  Run  .\\src\\ink\\setup.ps1  to recreate it.`
    );
  }
}

const _local = loadLocalConfig();

function requireConfig(): LocalConfig {
  if (_local) return _local;

  const appData = process.env["APPDATA"] ?? join(homedir(), ".config");
  throw new Error(
    `Local infrastructure config not found.\n` +
    `  Expected: ${join(appData, "unaxis", "unenter", "config.json")}\n\n` +
    `  Run once to create it:\n` +
    `    .\\src\\ink\\setup.ps1\n`
  );
}

// ── Root domain (bootstrap fallback) ─────────────────────────────────────────

/**
 * Synchronous domain accessor — reads from config.json.
 *
 * FALLBACK ONLY.  The live domain lives on the active UnaxisEnvironment record
 * (env.domain).  Use this only when the active environment has not yet loaded
 * or when bootstrapping the initial Supabase connection.
 */
export const DOMAIN: string = (() => {
  const d = _local?.domain ?? process.env["DOMAIN"];
  if (!d) {
    process.stderr.write(
      `[stack.ts] Warning: "domain" missing from config.json — run .\\src\\ink\\setup.ps1 to add it.\n`
    );
    return "";
  }
  return d;
})();

// ── Static fallback constants ─────────────────────────────────────────────────
// All reads go to config.json.  These are the source of truth ONLY when
// Supabase is unavailable.  For live coordinates, read from UnaxisEnvironment.

export const STACK_HOST = {
  label:     "P0W3R (fallback)",
  get ip()        { return requireConfig().stack.ip; },
  get proxyPort() { return requireConfig().stack.proxyPort; },
} as const;

export const NPM_HOST = {
  label:    "L0VE / NPM (fallback)",
  get ip()      { return requireConfig().npm.ip; },
  get port()    { return requireConfig().npm.port; },
  get apiUrl()  { const c = requireConfig().npm; return `http://${c.ip}:${c.port}/api`; },
  get uiUrl()   { const c = requireConfig().npm; return `http://${c.ip}:${c.port}`; },
  get email()   { return process.env["NPM_EMAIL"]    ?? requireConfig().npm.email; },
  /** @deprecated Use Vault via getActiveEnvironmentCredentials() — never store passwords in config.json. */
  get password(){ return process.env["NPM_PASSWORD"] ?? requireConfig().npm.password; },
  get letsencryptEmail() {
    return process.env["NPM_LE_EMAIL"]
        ?? requireConfig().npm.leEmail
        ?? requireConfig().npm.email;
  },
} as const;

// ── Safe IP accessors (never throw — return "" if config absent) ─────────────
// Use these in module-level constants (e.g. INFRA_SERVICES, MACHINES) where
// calling requireConfig() at import time would break cold-start without a
// config.json.  Hot paths (NPM_HOST.ip, STACK_HOST.ip) still throw intentionally
// so misconfigurations surface loudly at call time rather than silently.

/** NPM host IP from config.json — "" if config absent. */
export const NPM_IP_SAFE   = _local?.npm.ip    ?? "";
/** Stack/proxy host IP from config.json — "" if config absent. */
export const STACK_IP_SAFE = _local?.stack.ip  ?? "";

// ── Artifact store ────────────────────────────────────────────────────────────
// Compose YAML files are managed artifacts, NOT source repo files.
// They live outside the project directory so they survive repo cleans and are
// never accidentally committed.  Mirrors Portainer's /data/compose/{stack_id}/
// pattern where the control plane owns compose state, not the Git checkout.
//
//   Windows:     %APPDATA%\unaxis\unenter\stacks\
//   WSL:         /mnt/c/Users/<user>/AppData/Roaming/unaxis/unenter/stacks/
//   macOS/Linux: ~/.unaxis/unenter/stacks/
//
// ── Why WSL needs its own case (2026-09-06) ─────────────────────────────────
// After UNAXIS moved into WSL, process.platform became "linux" and homedir()
// became /home/<user>, so this resolved to /home/skill/.unaxis/... — a path
// that does not exist, because the artifact store still lives on the Windows
// side under %APPDATA%. Worse, that Linux path was then handed to a Windows
// docker binary, which read it as drive-relative and reported:
//
//   open Z:\home\skill\.unaxis\unenter\stacks\unenter-zones\docker-compose.yml
//
// A `shop` deploy therefore failed AFTER a successful build and push. The
// store is not moved here: Docker Desktop and any Windows-side tooling still
// need to read these files, so WSL reaches across to the same location.

/** True when running inside WSL (either WSL1 or WSL2). */
function isWsl(): boolean {
  if (process.platform !== "linux") return false;
  if (process.env["WSL_DISTRO_NAME"] || process.env["WSL_INTEROP"]) return true;
  try {
    // The kernel string contains "microsoft" under WSL and nowhere else.
    return readFileSync("/proc/version", "utf-8").toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

/** Windows %APPDATA% as seen from inside WSL, or null if it can't be located. */
function wslAppData(): string | null {
  // WSLENV/APPDATA are only present when the var was explicitly shared, so
  // probe the standard mount instead — that works on a default WSL2 setup.
  const candidates: string[] = [];
  const winUser = process.env["WIN_USER"] || process.env["USER"] || process.env["USERNAME"];
  if (winUser) candidates.push(`/mnt/c/Users/${winUser}/AppData/Roaming`);
  try {
    for (const name of readdirSync("/mnt/c/Users")) {
      const p = `/mnt/c/Users/${name}/AppData/Roaming`;
      if (!candidates.includes(p)) candidates.push(p);
    }
  } catch {
    /* /mnt/c not mounted — fall through to null */
  }
  // Prefer a candidate that already holds the store, so a multi-user box picks
  // the right profile rather than the first one alphabetically.
  for (const base of candidates) {
    if (existsSync(join(base, "unaxis", "unenter", "stacks"))) return base;
  }
  return candidates.find((c) => existsSync(c)) ?? null;
}

const _artifactBase = (() => {
  // Explicit override always wins — the escape hatch for any layout the
  // detection below doesn't anticipate.
  const override = process.env["UNAXIS_ARTIFACT_DIR"];
  if (override) return override;

  if (process.platform === "win32") {
    return join(process.env["APPDATA"] ?? join(homedir(), ".config"), "unaxis", "unenter", "stacks");
  }

  if (isWsl()) {
    const appData = wslAppData();
    if (appData) return join(appData, "unaxis", "unenter", "stacks");
    // No /mnt/c — fall through to the Linux default rather than throwing, so a
    // WSL box without drive mounts still starts.
  }

  return join(homedir(), ".unaxis", "unenter", "stacks");
})();

/**
 * Root of the UNAXIS artifact store.
 * Zone compose files live at:  join(ARTIFACT_STORE_DIR, zone.key, "docker-compose.yml")
 */
export const ARTIFACT_STORE_DIR = _artifactBase;

export const DNS_PROVIDER = {
  label:       "GoDaddy DNS",
  domain:      DOMAIN,
  checkDomain: DOMAIN,
  dohUrl:      "https://cloudflare-dns.com/dns-query",
} as const;

export const DDNS_PROVIDER = {
  label: "ASUS DDNS",
  get hostname() { return _local?.ddns?.hostname ?? ""; },
} as const;
