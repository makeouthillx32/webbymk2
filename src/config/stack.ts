// src/config/stack.ts
// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure topology — reads sensitive values from the local config file:
//
//   %APPDATA%\unenter\config.json     (Windows — primary)
//   ~/.unenter/config.json            (macOS / Linux fallback)
//
// To create the config file, run once from the project root:
//   .\src\ink\setup.ps1
//
// No IPs, passwords, or emails are stored in this source file.
// ─────────────────────────────────────────────────────────────────────────────

import { resolve, join } from "path";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";

// ── Project root ──────────────────────────────────────────────────────────────

function deriveProjectDir(): string {
  if (process.env["PROJECT_ROOT"]) return process.env["PROJECT_ROOT"];
  
  // Use import.meta.dir if available (Bun), or fallback to process.cwd()
  // which is typically the project root when run via run.ps1.
  const dir = (import.meta as any).dir;
  if (dir) return resolve(dir, "../..");
  
  return process.cwd();
}

export const PROJECT_DIR = deriveProjectDir();

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
  // Resolve config path: %APPDATA%\unenter\config.json (Windows) or
  // ~/.unenter/config.json (macOS / Linux)
  const appData = process.env["APPDATA"] ?? join(homedir(), ".config");
  const configPath = join(appData, "unenter", "config.json");

  if (!existsSync(configPath)) return null;

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
    `  Expected: ${join(appData, "unenter", "config.json")}\n\n` +
    `  Run once to create it:\n` +
    `    .\\src\\ink\\setup.ps1\n`
  );
}

// ── Root domain ───────────────────────────────────────────────────────────────

/**
 * Root domain for all zones — sourced from config.json `domain` field.
 * Set once during  .\src\ink\setup.ps1  and never committed to git.
 */
export const DOMAIN: string = (() => {
  const d = _local?.domain ?? process.env["DOMAIN"];
  if (!d) {
    // Non-fatal — TUI still works; NPM registration / zone wizard will surface
    // the missing value when they actually need it.
    process.stderr.write(
      `[unt.ink] Warning: "domain" missing from config.json — run .\\src\\ink\\setup.ps1 to add it.\n`
    );
    return "";
  }
  return d;
})();

// ── Stack host (P0W3R) ────────────────────────────────────────────────────────

export const STACK_HOST = {
  label:     "P0W3R",
  get ip()        { return requireConfig().stack.ip; },
  get proxyPort() { return requireConfig().stack.proxyPort; },
} as const;

// ── NPM host (L0VE) ───────────────────────────────────────────────────────────

export const NPM_HOST = {
  label: "L0VE / NPM",
  get ip()      { return requireConfig().npm.ip; },
  get port()    { return requireConfig().npm.port; },
  get apiUrl()  { const c = requireConfig().npm; return `http://${c.ip}:${c.port}/api`; },
  get uiUrl()   { const c = requireConfig().npm; return `http://${c.ip}:${c.port}`; },
  // Env vars override config file — useful for CI / remote sessions
  get email()   { return process.env["NPM_EMAIL"]    ?? requireConfig().npm.email; },
  get password(){ return process.env["NPM_PASSWORD"] ?? requireConfig().npm.password; },
  get letsencryptEmail() {
    return process.env["NPM_LE_EMAIL"]
        ?? requireConfig().npm.leEmail
        ?? requireConfig().npm.email;
  },
} as const;

// ── DNS / DDNS providers ──────────────────────────────────────────────────────

export const DNS_PROVIDER = {
  label:       "GoDaddy DNS",
  domain:      DOMAIN,
  checkDomain: DOMAIN,
  dohUrl:      "https://cloudflare-dns.com/dns-query",
} as const;

export const DDNS_PROVIDER = {
  label: "ASUS DDNS",
  get hostname() {
    return _local?.ddns?.hostname ?? "";
  },
} as const;
