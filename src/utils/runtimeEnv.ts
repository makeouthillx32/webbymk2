import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { detectProjectRoot } from "./rootGuard.js";

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

function walkForProjectRoot(from: string): string | null {
  let current = resolve(from);
  while (true) {
    if (
      existsSync(join(current, "docker-compose.yml")) &&
      existsSync(join(current, ".env")) &&
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

  const explicit = process.env.UNAXIS_PROJECT_ROOT ?? process.env.UNENTER_PROJECT_ROOT;
  if (isPresent(explicit)) {
    const root = resolve(explicit);
    if (existsSync(join(root, ".env"))) {
      state.projectRoot = root;
      return root;
    }
  }

  const detected = detectProjectRoot();
  const root = detected.valid === true ? detected.root : detected.detected;
  if (root) {
    state.projectRoot = root;
    return root;
  }

  const walked = walkForProjectRoot(process.cwd());
  if (walked) {
    state.projectRoot = walked;
    return walked;
  }

  return null;
}

export function normalizeRuntimeEnvAliases(): void {
  const anon =
    firstEnvValue(["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY", "ANON_KEY"]);
  if (anon) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || anon;
    process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || anon;
    process.env.ANON_KEY = process.env.ANON_KEY || anon;
  }

  const service =
    firstEnvValue(["SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);
  if (service) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || service;
    process.env.SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || service;
    process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || service;
  }

  if (!isPresent(process.env.SUPABASE_URL)) {
    process.env.SUPABASE_URL = "http://localhost:8000";
  }
}

export function ensureRuntimeEnv(force = false): RuntimeEnvState {
  if (state.loaded && !force) return state;

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
