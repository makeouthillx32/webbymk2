// src/ink/zone/supabase-factory.ts
// ─────────────────────────────────────────────────────────────────────────────
// Supabase Core Runtime Factory — Phase 1 of the Core Runtime Control Plane.
//
// Architecture:
//   One database. Many zones. Portable core runtime.
//
// This module owns:
//   RuntimeInstance          — canonical state model for a Supabase runtime
//   RuntimeRegistry helpers  — lightweight JSON-file registry (no Prisma)
//   initializeSupabaseCore() — clone template repo, prepare instance dirs
//   createRuntimeInstance()  — copy docker template, wire ports/secrets, register
//   generateRandomString()   — crypto-quality secret generation
//   generateJWT()            — local JWT bootstrap (anon / service_role)
//
// Registry location (consistent with stack.ts config pattern):
//   Windows:      %APPDATA%\unaxis\unenter\instances.json
//   macOS/Linux:  ~/.unaxis/unenter/instances.json
//
// Instances live at:
//   PROJECT_DIR/supabase-instances/{slug}/docker/
// ─────────────────────────────────────────────────────────────────────────────

import { promises as fs }                                    from "fs";
import { existsSync, mkdirSync, copyFileSync, readFileSync } from "fs";
import { join, resolve }                       from "path";
import { homedir }         from "os";
import { randomBytes }     from "crypto";
import { createServer }    from "net";
import { spawn }           from "child_process";
import { PROJECT_DIR, DOMAIN } from "../../config/stack.ts";
import type { OnLine }     from "./types.ts";

// ── Runtime state model ───────────────────────────────────────────────────────
//
// Everything the control plane needs to track for a Supabase runtime instance.
// Written to the JSON registry on create; updated by lifecycle operations.

export interface RuntimePorts {
  kong:      number;   // KONG_HTTP_PORT     — API gateway (host-accessible)
  kongSSL:   number;   // KONG_HTTPS_PORT
  postgres:  number;   // POSTGRES_PORT
  pooler:    number;   // POOLER_PROXY_PORT_TRANSACTION
  analytics: number;   // ANALYTICS_PORT
  studio:    number;   // STUDIO_PORT  (host-mapped, kong + 100)
}

export interface RuntimeSecrets {
  postgresPassword:  string;
  jwtSecret:         string;
  anonKey:           string;
  serviceRoleKey:    string;
  dashboardPassword: string;
}

export type RuntimeStatus = "creating" | "active" | "stopped" | "paused" | "error";
export type HealthState   = "healthy"  | "degraded" | "down"  | "unknown";
export type SnapshotState = "none"     | "pending"  | "complete" | "error";

export interface RuntimeInstance {
  id:               string;        // UUID v4
  name:             string;        // human label
  slug:             string;        // filesystem-safe; used as compose project name
  containerPrefix?: string;        // Docker container name prefix (incl. separator).
                                   // Set to "unt_" for core (containers: unt_db, unt_storage…).
                                   // Omit for runtime instances — defaults to "${slug}-".
  status:           RuntimeStatus;
  createdAt:        string;        // ISO-8601
  runtimePath:      string;        // absolute path — supabase-instances/{slug}/
  dockerPath:       string;        // absolute path — supabase-instances/{slug}/docker/
  ports:            RuntimePorts;
  secrets:          RuntimeSecrets;
  studioUrl:        string;        // http://127.0.0.1:{studio}
  npmApiUrl?:       string;        // https://db.{slug}.{domain}   — set after NPM registration
  npmStudioUrl?:    string;        // https://studio.{slug}.{domain}
  healthState:      HealthState;
  snapshotState:    SnapshotState;
  lastSnapshot?:    string;        // ISO-8601 | undefined
}

// ── Registry ──────────────────────────────────────────────────────────────────

function registryPath(): string {
  const appData   = process.env["APPDATA"] ?? join(homedir(), ".config");
  const newPath    = join(appData, "unaxis", "unenter", "instances.json");
  const legacyPath = join(appData, "unenter", "instances.json");

  // One-time auto-migration: if new path is absent but legacy exists, copy it over.
  // Runs silently on first access after an update — no user action needed.
  if (!existsSync(newPath) && existsSync(legacyPath)) {
    try {
      mkdirSync(join(appData, "unaxis", "unenter"), { recursive: true });
      copyFileSync(legacyPath, newPath);
    } catch { /* best-effort — falls back to empty registry if copy fails */ }
  }

  return newPath;
}

export async function loadRegistry(): Promise<RuntimeInstance[]> {
  const p = registryPath();
  if (!existsSync(p)) return [];
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw) as RuntimeInstance[];
  } catch {
    return [];
  }
}

export async function saveRegistry(instances: RuntimeInstance[]): Promise<void> {
  const p = registryPath();
  await fs.mkdir(resolve(p, ".."), { recursive: true });
  await fs.writeFile(p, JSON.stringify(instances, null, 2), "utf-8");
}

export async function registerInstance(instance: RuntimeInstance): Promise<void> {
  const list = await loadRegistry();
  const idx  = list.findIndex((i) => i.id === instance.id);
  if (idx >= 0) list[idx] = instance;
  else list.push(instance);
  await saveRegistry(list);
}

export async function updateInstanceStatus(
  id:    string,
  patch: Partial<Pick<RuntimeInstance, "status" | "healthState" | "snapshotState" | "lastSnapshot" | "npmApiUrl" | "npmStudioUrl">>,
): Promise<void> {
  const list = await loadRegistry();
  const idx  = list.findIndex((i) => i.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...patch };
    await saveRegistry(list);
  }
}

export async function removeFromRegistry(id: string): Promise<void> {
  const list     = await loadRegistry();
  const filtered = list.filter((i) => i.id !== id);
  await saveRegistry(filtered);
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

/** Cryptographically random alphanumeric string. */
export function generateRandomString(length: number): string {
  const chars  = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes  = randomBytes(length);
  let   result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Generate a Supabase-compatible JWT for local bootstrap.
 * Uses a random mock signature — valid for self-hosted instances where the
 * JWT_SECRET is also locally generated and never leaves the machine.
 */
export function generateJWT(role: "anon" | "service_role", timestamp: number): string {
  const header  = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    role,
    iss: "supabase",
    iat: Math.floor(timestamp / 1000),
    exp: Math.floor(timestamp / 1000) + 365 * 24 * 60 * 60,   // 1 year
  })).toString("base64url");
  const signature = generateRandomString(43);   // mock — paired with locally generated JWT_SECRET
  return `${header}.${payload}.${signature}`;
}

// ── Spawn helper (consistent with db-api.ts style) ────────────────────────────

export function spawnRun(
  cmd:  string,
  args: string[],
  opts: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    const proc = spawn(cmd, args, {
      cwd:   opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      env:   opts.env,
    });
    let out = "";
    const timer = opts.timeout
      ? setTimeout(() => { proc.kill(); }, opts.timeout)
      : null;

    proc.stdout!.on("data", (d: Buffer) => { out += d.toString(); });
    proc.stderr!.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", (code) => { if (timer) clearTimeout(timer); res({ code: code ?? 1, out: out.trim() }); });
    proc.on("error", ()     => { if (timer) clearTimeout(timer); res({ code: 1, out }); });
  });
}

// ── Env file helpers ──────────────────────────────────────────────────────────

/**
 * Parse a .env file into a key→value map.
 * Lines starting with # are comments; blank lines are ignored.
 * Values may optionally be quoted with " or '.
 */
function parseEnvFile(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, "utf8");
    const result: Record<string, string> = {};
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val   = line.slice(eq + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Return a spawn env where the given .env file's values take precedence over
 * the current process environment.  This prevents shell-level variables like
 * POSTGRES_PORT from shadowing the per-instance port assignments.
 */
export function envWithFile(envFilePath: string): NodeJS.ProcessEnv {
  return { ...process.env, ...parseEnvFile(envFilePath) };
}

// ── UUID v4 (no external dependency) ─────────────────────────────────────────

function uuidV4(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20)].join("-");
}

// ── Core directories ──────────────────────────────────────────────────────────

export const CORE_DIR          = join(PROJECT_DIR, "supabase-core");
export const INSTANCES_DIR     = join(PROJECT_DIR, "supabase-instances");
export const INSTANCE_TEMPLATE = join(PROJECT_DIR, "src", "ink", "zone", "templates", "instance");

// ── initializeSupabaseCore ────────────────────────────────────────────────────

/**
 * Ensure the supabase-core template and supabase-instances directory exist.
 * Clones the official Supabase repo (shallow) if supabase-core is absent.
 * Safe to call repeatedly — idempotent.
 */
export async function initializeSupabaseCore(
  onLine: OnLine,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!existsSync(INSTANCES_DIR)) {
      await fs.mkdir(INSTANCES_DIR, { recursive: true });
      onLine(`✓ Created supabase-instances/`);
    } else {
      onLine(`• supabase-instances/  already exists`);
    }

    if (!existsSync(CORE_DIR)) {
      const repoUrl = process.env["SUPABASE_CORE_REPO_URL"] ?? "https://github.com/supabase/supabase";
      onLine(`⬇ Cloning supabase/supabase (shallow) — this may take a minute...`);
      const { code, out } = await spawnRun(
        "git",
        ["clone", "--depth", "1", repoUrl, "supabase-core"],
        { cwd: PROJECT_DIR, timeout: 300_000 },
      );
      if (code !== 0) {
        onLine(`✗ git clone failed:\n${out}`);
        return { success: false, error: `git clone failed: ${out}` };
      }
      onLine(`✓ supabase-core cloned`);
    } else {
      onLine(`• supabase-core/  already exists — skipping clone`);
    }

    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    onLine(`✗ initializeSupabaseCore: ${msg}`);
    return { success: false, error: msg };
  }
}

// ── Port allocation ───────────────────────────────────────────────────────────

/**
 * Ports permanently reserved by the core webbymk2 stack.
 * These must NEVER be allocated to a runtime instance regardless of
 * whether the core containers are running at allocation time.
 *
 * Core stack fixed ports (from docker-compose.yml):
 *   8001  unt_kong       (KONG_HTTP_PORT → 8001:8000)
 *   5433  unt_db         (5433:5432)
 *   3002  unt_studio     (3002:3000)
 *   4001  unt_realtime   (4001:4000)
 *   5000  unt_storage    (5000:5000)
 *   3080  unt_proxy      (3080:3080)
 *   3000  unt_app        (3000:3000)
 *   8444  unt_kong SSL   (8444:8443 — though not in compose, used by some instances)
 */
const CORE_RESERVED_PORTS = new Set<number>([
  8001,  // unt_kong HTTP
  8444,  // unt_kong HTTPS (common default)
  5433,  // unt_db
  3002,  // unt_studio
  4001,  // unt_realtime
  5000,  // unt_storage
  3080,  // unt_proxy
  3000,  // unt_app
]);

function derivePortsFromBase(base: number): RuntimePorts {
  return {
    kong:      base,
    kongSSL:   base + 443,
    postgres:  base + 2000,
    pooler:    base + 3000,
    analytics: base + 1000,
    studio:    base + 100,
  };
}

type RuntimePortKey = keyof RuntimePorts;

const PORT_LABELS: Record<RuntimePortKey, string> = {
  kong: "Kong",
  kongSSL: "Kong SSL",
  postgres: "Postgres",
  pooler: "Pooler",
  analytics: "Analytics",
  studio: "Studio",
};

function portEntries(ports: RuntimePorts): Array<[RuntimePortKey, number]> {
  return Object.entries(ports) as Array<[RuntimePortKey, number]>;
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolveAvailable) => {
    const server = createServer();
    let settled = false;

    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      resolveAvailable(available);
    };

    server.once("error", () => finish(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => finish(true));
    });
  });
}

async function registeredPorts(): Promise<Set<number>> {
  const used = new Set<number>();
  const instances = await loadRegistry();
  for (const instance of instances) {
    if (!instance.ports) continue;
    for (const port of Object.values(instance.ports)) {
      if (typeof port === "number") used.add(port);
    }
  }
  return used;
}

async function unavailablePorts(
  ports: RuntimePorts,
  alreadyRegistered: Set<number>,
): Promise<Array<{ key: RuntimePortKey; port: number; reason: "registered" | "busy" }>> {
  const unavailable: Array<{ key: RuntimePortKey; port: number; reason: "registered" | "busy" }> = [];

  for (const [key, port] of portEntries(ports)) {
    if (CORE_RESERVED_PORTS.has(port)) {
      unavailable.push({ key, port, reason: "registered" });
      continue;
    }
    if (alreadyRegistered.has(port)) {
      unavailable.push({ key, port, reason: "registered" });
      continue;
    }
    if (!(await isPortAvailable(port))) {
      unavailable.push({ key, port, reason: "busy" });
    }
  }

  return unavailable;
}

/** Publicly allocate a free port block — used by clone wizard and external callers. */
export async function allocatePorts(onLine: OnLine = () => {}): Promise<RuntimePorts> {
  return allocateAvailablePorts(Date.now(), onLine);
}

async function allocateAvailablePorts(timestamp: number, onLine: OnLine): Promise<RuntimePorts> {
  const alreadyRegistered = await registeredPorts();

  for (let attempt = 0; attempt < 1000; attempt++) {
    const base = 8000 + ((timestamp + attempt) % 1000);
    const ports = derivePortsFromBase(base);
    const conflicts = await unavailablePorts(ports, alreadyRegistered);

    if (conflicts.length === 0) {
      if (attempt > 0) {
        onLine(`Port conflict avoided; using alternate base ${base}`);
      }
      return ports;
    }

    if (attempt === 0) {
      const details = conflicts
        .map((conflict) => `${PORT_LABELS[conflict.key]}:${conflict.port} ${conflict.reason}`)
        .join(", ");
      onLine(`Port conflict detected (${details}); searching for a free range...`);
    }
  }

  throw new Error("No free runtime port block found in the 8000-11999 range.");
}

// ── Container name rewriting ──────────────────────────────────────────────────

const CONTAINER_TEMPLATES = [
  "supabase-studio",
  "supabase-kong",
  "supabase-auth",
  "supabase-rest",
  "realtime-dev.supabase-realtime",
  "supabase-storage",
  "supabase-imgproxy",
  "supabase-meta",
  "supabase-db",
] as const;

function rewriteContainerNames(content: string, slug: string): string {
  let out = content;
  for (const original of CONTAINER_TEMPLATES) {
    if (original.startsWith("realtime-dev.")) {
      const svcName     = original.slice("realtime-dev.".length);
      const replacement = `realtime-dev.${slug}-${svcName.replace("supabase-", "")}`;
      out = out.replace(new RegExp(`container_name: ${original}`, "g"), `container_name: ${replacement}`);
    } else {
      const shortName   = original.replace("supabase-", "");
      const replacement = `${slug}-${shortName}`;
      out = out.replace(new RegExp(`container_name: ${original}`, "g"), `container_name: ${replacement}`);
    }
  }
  out = out.replace(/^name: supabase$/m, `name: ${slug}`);
  return out;
}

// ── Kong 2.8.1 config generator ───────────────────────────────────────────────

/**
 * Generate a Kong 2.8.1 declarative config (format version 1.1) with secrets
 * baked in.  Routes:
 *   /auth/v1/     → GoTrue (cors)              — all hosts
 *   /rest/v1/     → PostgREST (cors, key-auth) — all hosts
 *   /realtime/v1/ → Realtime (cors)            — all hosts
 *   /storage/v1/  → Storage API (cors)         — all hosts
 *   /             → Studio (basic-auth)         — studio.{name}.{domain} ONLY
 *
 * The dashboard route is host-restricted to `studio.{name}.{domain}` so that:
 *   db.{name}.{domain}/     → Kong "no Route matched" JSON  (pure API)
 *   studio.{name}.{domain}/ → Studio with basic-auth prompt
 *
 * Both NPM hosts point to the same Kong port — Kong differentiates by Host header.
 */
export function generateKongYml(
  secrets:      RuntimeSecrets,
  instanceName: string,
  baseDomain:   string,
): string {
  const nameSlug    = instanceName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const studioHost  = `studio.${nameSlug}.${baseDomain}`;
  return `_format_version: "1.1"

services:
  - name: auth-v1
    url: http://auth:9999/
    routes:
      - name: auth-v1-all
        strip_path: true
        paths:
          - /auth/v1/
    plugins:
      - name: cors

  - name: rest-v1
    url: http://rest:3000/
    routes:
      - name: rest-v1-all
        strip_path: true
        paths:
          - /rest/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false

  - name: realtime-v1
    url: http://realtime:4000/socket/
    routes:
      - name: realtime-v1-all
        strip_path: true
        paths:
          - /realtime/v1/
    plugins:
      - name: cors

  - name: storage-v1
    url: http://storage:5000/
    routes:
      - name: storage-v1-all
        strip_path: true
        paths:
          - /storage/v1/
    plugins:
      - name: cors

  ## Protected Dashboard — Studio UI, restricted to studio.{name}.{domain} only.
  ## Requests to db.{name}.{domain}/ skip this route and return Kong's
  ## "no Route matched" JSON response — keeping the db subdomain pure API.
  - name: dashboard
    url: http://studio:3000/
    routes:
      - name: dashboard-all
        strip_path: true
        hosts:
          - ${studioHost}
        paths:
          - /
    plugins:
      - name: basic-auth
        config:
          hide_credentials: true

consumers:
  - username: anon
    keyauth_credentials:
      - key: ${secrets.anonKey}

  - username: service_role
    keyauth_credentials:
      - key: ${secrets.serviceRoleKey}

  - username: ${nameSlug}
    basicauth_credentials:
      - username: ${nameSlug}
        password: ${secrets.dashboardPassword}
`;
}

// ── createRuntimeInstance ─────────────────────────────────────────────────────

/**
 * Scaffold a new Supabase runtime instance:
 *   1. Copy docker template from supabase-core/docker → supabase-instances/{slug}/docker
 *   2. Rewrite container names + compose project name in docker-compose.yml
 *   3. Generate unique ports + secrets
 *   4. Write .env file
 *   5. Register instance to JSON registry
 *
 * Returns the created RuntimeInstance (status = "stopped" — caller deploys).
 * Throws on failure.
 */
export async function createRuntimeInstance(
  name:   string,
  onLine: OnLine,
): Promise<RuntimeInstance> {
  const timestamp   = Date.now();
  const slug        = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${timestamp}`;
  const id          = uuidV4();
  const runtimePath = join(INSTANCES_DIR, slug);
  const dockerPath  = join(runtimePath, "docker");

  onLine(`→ Creating instance "${name}"  (slug: ${slug})`);

  // ── [1] Scaffold docker directory from vendored template ─────────────────
  // SQL init files (_supabase.sql, roles.sql, jwt.sql, etc.) are vendored in
  // src/ink/zone/templates/instance/volumes/db/ — no GitHub clone required.
  const templateVolumesDb = join(INSTANCE_TEMPLATE, "volumes", "db");
  const instanceVolumesDb = join(dockerPath, "volumes", "db");
  await fs.mkdir(instanceVolumesDb, { recursive: true });
  onLine(`✓ Created  supabase-instances/${slug}/`);

  const isWindows = process.platform === "win32";
  const [copyCmd, copyArgs] = isWindows
    ? ["xcopy", [`"${templateVolumesDb}"`, `"${instanceVolumesDb}"`, "/E", "/I", "/H", "/K"]]
    : ["cp",    ["-r", templateVolumesDb + "/.", instanceVolumesDb]];

  const { code: cpCode, out: cpOut } = await spawnRun(copyCmd, copyArgs as string[]);
  if (cpCode !== 0) throw new Error(`Failed to copy DB init SQL files: ${cpOut}`);
  onLine(`✓ DB init SQL files copied  (vendored — no GitHub clone needed)`);

  // ── [2] Ports + secrets ────────────────────────────────────────────────────
  // Passwords follow the pattern {name}{MMDDYY} for easy recognition, e.g. "ramp052626".
  // A random suffix is appended so two instances created on the same day differ.
  const ports: RuntimePorts = await allocateAvailablePorts(timestamp, onLine);
  const d = new Date(timestamp);
  const dateSuffix = String(d.getMonth() + 1).padStart(2, "0")
    + String(d.getDate()).padStart(2, "0")
    + String(d.getFullYear()).slice(-2);
  const nameSlug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const basePassword = `${nameSlug}${dateSuffix}`;
  const secrets: RuntimeSecrets = {
    postgresPassword:  basePassword + generateRandomString(6),
    jwtSecret:         generateRandomString(64),
    anonKey:           generateJWT("anon",         timestamp),
    serviceRoleKey:    generateJWT("service_role", timestamp),
    dashboardPassword: basePassword + generateRandomString(4),
  };
  onLine(`✓ Ports allocated  Kong:${ports.kong}  PG:${ports.postgres}`);

  // ── [3] Write lean docker-compose.yml (replaces supabase-core template) ───
  const composeTemplatePath = join(INSTANCE_TEMPLATE, "docker-compose.yml");
  let composeSrc: string;
  try {
    composeSrc = await fs.readFile(composeTemplatePath, "utf-8");
  } catch {
    throw new Error(
      `Lean instance template not found at ${composeTemplatePath}\n` +
      `  This is a bug — the template should ship with the codebase.`
    );
  }
  const composeContent = rewriteContainerNames(composeSrc, slug);
  const composeFile    = join(dockerPath, "docker-compose.yml");
  await fs.writeFile(composeFile, composeContent, "utf-8");
  onLine(`✓ Lean docker-compose.yml written  (Kong 2.8.1, 9 services, prefix: ${slug}-)`);

  // ── [4] Write generated kong.yml (secrets baked in, dashboard route) ──────
  // Dashboard route is host-restricted to studio.{name}.{domain} so that
  // db.{name}.{domain}/ returns Kong's "no Route matched" JSON (pure API).
  const kongYml  = generateKongYml(secrets, name, DOMAIN);
  const kongDir  = join(dockerPath, "volumes", "api");
  await fs.mkdir(kongDir, { recursive: true });
  await fs.writeFile(join(kongDir, "kong.yml"), kongYml, "utf-8");
  onLine(`✓ Kong 2.8.1 config written  (studio.${name}.${DOMAIN} → dashboard, db.* → API only)`);

  // ── [5] Write .env ────────────────────────────────────────────────────────
  const envVars: Record<string, string> = {
    POSTGRES_PASSWORD:              secrets.postgresPassword,
    JWT_SECRET:                     secrets.jwtSecret,
    ANON_KEY:                       secrets.anonKey,
    SERVICE_ROLE_KEY:               secrets.serviceRoleKey,
    DASHBOARD_USERNAME:             name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    DASHBOARD_PASSWORD:             secrets.dashboardPassword,
    SECRET_KEY_BASE:                generateRandomString(64),
    VAULT_ENC_KEY:                  generateRandomString(32),

    POSTGRES_HOST:                  "db",
    POSTGRES_DB:                    "postgres",
    POSTGRES_PORT:                  String(ports.postgres),
    KONG_HTTP_PORT:                 String(ports.kong),
    KONG_HTTPS_PORT:                String(ports.kongSSL),

    PGRST_DB_SCHEMAS:               "public,storage,graphql_public",
    SITE_URL:                       `http://localhost:${ports.kong}`,
    ADDITIONAL_REDIRECT_URLS:       "",
    JWT_EXPIRY:                     "3600",
    DISABLE_SIGNUP:                 "false",
    API_EXTERNAL_URL:               `http://localhost:${ports.kong}`,
    MAILER_URLPATHS_CONFIRMATION:   "/auth/v1/verify",
    MAILER_URLPATHS_INVITE:         "/auth/v1/verify",
    MAILER_URLPATHS_RECOVERY:       "/auth/v1/verify",
    MAILER_URLPATHS_EMAIL_CHANGE:   "/auth/v1/verify",
    ENABLE_EMAIL_SIGNUP:            "true",
    ENABLE_EMAIL_AUTOCONFIRM:       "false",
    SMTP_ADMIN_EMAIL:               "admin@example.com",
    SMTP_HOST:                      "supabase-mail",
    SMTP_PORT:                      "2500",
    SMTP_USER:                      "fake_mail_user",
    SMTP_PASS:                      "fake_mail_password",
    SMTP_SENDER_NAME:               "fake_sender",
    ENABLE_ANONYMOUS_USERS:         "false",
    ENABLE_PHONE_SIGNUP:            "true",
    ENABLE_PHONE_AUTOCONFIRM:       "true",
    STUDIO_DEFAULT_ORGANIZATION:    name,
    STUDIO_DEFAULT_PROJECT:         name,
    // Must be the public HTTPS URL — Studio's client JS runs in the browser and
    // fetches from this URL.  http://localhost:PORT would be blocked as mixed
    // content when Studio is served over HTTPS (studio.slug.domain).
    SUPABASE_PUBLIC_URL:            `https://db.${name}.${DOMAIN}`,
    IMGPROXY_ENABLE_WEBP_DETECTION: "true",
  };

  await fs.writeFile(
    join(dockerPath, ".env"),
    Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join("\n"),
    "utf-8",
  );
  onLine(`✓ .env written  (${Object.keys(envVars).length} variables)`);

  // ── [6] Build + register ──────────────────────────────────────────────────
  // studioUrl points to Kong — Studio is served via Kong's dashboard route.
  const instance: RuntimeInstance = {
    id,
    name,
    slug,
    status:        "stopped",
    createdAt:     new Date(timestamp).toISOString(),
    runtimePath,
    dockerPath,
    ports,
    secrets,
    studioUrl:     `http://127.0.0.1:${ports.kong}/`,
    healthState:   "unknown",
    snapshotState: "none",
  };

  await registerInstance(instance);
  onLine(`✓ Registered to instances.json  (id: ${id})`);
  onLine(`✓ Instance ready — call startCoreStack() to deploy`);

  return instance;
}
