import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { homedir } from "os";
import { detectProjectRoot } from "./rootGuard.js";
import { getSettingsPath } from "./secureStorage/fileStorage.js";

type RuntimeEnvState = {
  loaded: boolean;
  envFiles: string[];
  projectRoot: string | null;
};

const state: RuntimeEnvState = {
  loaded: false,
  envFiles: [],
  projectRoot: null,
};

function isPresent(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stripInlineComment(value: string): string {
  let quote: string | null = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if ((ch === '"' || ch === "'") && value[i - 1] !== "\\") {
      quote = quote === ch ? null : quote ?? ch;
      continue;
    }
    if (ch === "#" && quote === null && /\s/.test(value[i - 1] ?? " ")) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value;
}

function parseEnvValue(raw: string): string {
  let value = stripInlineComment(raw.trim());
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.replace(/\\n/g, "\n").trim();
}

function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;

  const text = readFileSync(file, "utf-8").replace(/^\uFEFF/, "");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1]!;
    const value = parseEnvValue(match[2] ?? "");
    if (!isPresent(process.env[key])) {
      process.env[key] = value;
    }
  }

  if (!state.envFiles.includes(file)) {
    state.envFiles.push(file);
  }
}

// ── Migration helper ──────────────────────────────────────────────────────────
// On first run after upgrade, copy projectRoot from the legacy
// %APPDATA%\unenter\config.json into ~/.unaxis/settings.json so the new
// credential store picks it up automatically.  Runs at most once per machine
// (skipped if default_project is already in settings.json).

function hasProjectMarkers(root: string): boolean {
  const dir = resolve(root);
  return (
    existsSync(join(dir, "docker-compose.yml")) &&
    existsSync(join(dir, "src", "ink"))
  );
}

function writeSettingsAtomic(settingsPath: string, settings: Record<string, string>): void {
  const dir = dirname(settingsPath);
  const tmpPath = join(dir, `.settings.json.${process.pid}.${Date.now()}.tmp`);

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  try {
    writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + "\n", { mode: 0o644 });
    try { chmodSync(tmpPath, 0o644); } catch {}
    renameSync(tmpPath, settingsPath);
    try { chmodSync(settingsPath, 0o644); } catch {}
  } catch (error) {
    try { unlinkSync(tmpPath); } catch {}
    throw error;
  }
}

function runMigrationOnce(): void {
  try {
    const settingsPath = getSettingsPath()
    // Read current settings synchronously
    let settings: Record<string, string> = {}
    if (existsSync(settingsPath)) {
      try { settings = JSON.parse(readFileSync(settingsPath, "utf-8")) } catch {}
    }
    if (settings["default_project"]) return  // already migrated

    // Look for legacy config
    const appData = process.env["APPDATA"] ?? join(homedir(), ".config")
    const legacyPath = join(appData, "unenter", "config.json")
    if (!existsSync(legacyPath)) return

    let legacy: Record<string, string> = {}
    try { legacy = JSON.parse(readFileSync(legacyPath, "utf-8")) } catch { return }

    const projectRoot = legacy["projectRoot"]
    if (typeof projectRoot !== "string" || !projectRoot.trim()) return

    const resolvedProjectRoot = resolve(projectRoot.trim())
    if (!hasProjectMarkers(resolvedProjectRoot)) return

    // Write migrated value
    settings["default_project"] = resolvedProjectRoot
    writeSettingsAtomic(settingsPath, settings)
  } catch {
    // Migration is best-effort — never crash the TUI over this
  }
}

// .env is not a required marker — it's gitignored and absent in worktrees.
// We walk for docker-compose.yml + src/ink (same as rootGuard.ts).
function walkForProjectRoot(from: string): string | null {
  let current = resolve(from);
  while (true) {
    if (
      existsSync(join(current, "docker-compose.yml")) &&
      existsSync(join(current, "src", "ink"))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function resolveRuntimeProjectRoot(): string | null {
  if (state.projectRoot) return state.projectRoot;

  // Explicit override via env var, but still require real project markers.
  const explicit = process.env.UNAXIS_PROJECT_ROOT ?? process.env.UNENTER_PROJECT_ROOT ?? process.env.PROJECT_ROOT;
  if (isPresent(explicit)) {
    const root = resolve(explicit);
    if (hasProjectMarkers(root)) {
      state.projectRoot = root;
      return root;
    }
  }

  // Use rootGuard (git-aware) as primary strategy
  const detected = detectProjectRoot();
  const root = detected.valid === true ? detected.root : detected.detected;
  if (root) {
    state.projectRoot = root;
    return root;
  }

  // Final fallback: blind marker walk
  const walked = walkForProjectRoot(process.cwd());
  if (walked) {
    state.projectRoot = walked;
    return walked;
  }

  // Last resort: read default_project directly from settings.json. This lets
  // `unaxis config set default_project` work even before the TUI has had a
  // chance to chdir, but still requires real project markers.
  try {
    const settingsPath = getSettingsPath()
    if (existsSync(settingsPath)) {
      const raw = JSON.parse(readFileSync(settingsPath, "utf-8"))
      const saved = raw?.["default_project"]
      if (typeof saved === "string" && saved.trim()) {
        const root = resolve(saved.trim())
        if (hasProjectMarkers(root)) {
          state.projectRoot = root
          return state.projectRoot
        }
      }
    }
  } catch {}

  return null;
}

export function normalizeRuntimeEnvAliases(): void {
  const anon =
    firstEnvValue(["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY", "ANON_KEY"]);
  if (anon) {
    if (!isPresent(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon;
    if (!isPresent(process.env.SUPABASE_ANON_KEY)) process.env.SUPABASE_ANON_KEY = anon;
    if (!isPresent(process.env.ANON_KEY)) process.env.ANON_KEY = anon;
  }

  const service =
    firstEnvValue(["SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);
  if (service) {
    if (!isPresent(process.env.SUPABASE_SERVICE_ROLE_KEY)) process.env.SUPABASE_SERVICE_ROLE_KEY = service;
    if (!isPresent(process.env.SERVICE_ROLE_KEY)) process.env.SERVICE_ROLE_KEY = service;
    if (!isPresent(process.env.SUPABASE_SERVICE_KEY)) process.env.SUPABASE_SERVICE_KEY = service;
  }

  if (!isPresent(process.env.SUPABASE_URL)) {
    process.env.SUPABASE_URL = "http://localhost:8000";
  }
}

export function ensureRuntimeEnv(force = false): RuntimeEnvState {
  if (state.loaded && !force) return state;

  // One-time migration: legacy %APPDATA%\unenter\config.json → settings.json
  runMigrationOnce();

  const root = resolveRuntimeProjectRoot();
  if (root) {
    loadEnvFile(join(root, ".env"));
    loadEnvFile(join(root, ".env.local"));
  }

  normalizeRuntimeEnvAliases();
  state.loaded = true;
  return state;
}

export function firstEnvValue(keys: readonly string[], fallback = ""): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return fallback;
}

export function getRuntimeKongUrl(): string {
  ensureRuntimeEnv(true);
  const explicit = firstEnvValue(["SUPABASE_URL"]);
  if (explicit && !explicit.includes("kong") && !explicit.includes("localhost")) {
    return explicit;
  }
  return "http://127.0.0.1:" + firstEnvValue(["KONG_HTTP_PORT"], "8001");
}

export function getRuntimeServiceKey(): string {
  ensureRuntimeEnv(true);
  return firstEnvValue([
    "SUPABASE_SERVICE_ROLE_KEY",
    "SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
  ]);
}

export function getRuntimeAnonKey(): string {
  ensureRuntimeEnv(true);
  return firstEnvValue([
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "ANON_KEY",
  ]);
}

export function getRuntimePort(key: string, fallback: string): string {
  ensureRuntimeEnv(true);
  return firstEnvValue([key], fallback);
}
