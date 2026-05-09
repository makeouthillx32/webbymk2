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
//   Windows:      %APPDATA%\unenter\instances.json
//   macOS/Linux:  ~/.unenter/instances.json
//
// Instances live at:
//   PROJECT_DIR/supabase-instances/{slug}/docker/
// ─────────────────────────────────────────────────────────────────────────────

import { promises as fs } from "fs";
import { existsSync }      from "fs";
import { join, resolve }   from "path";
import { homedir }         from "os";
import { randomBytes }     from "crypto";
import { spawn }           from "child_process";
import { PROJECT_DIR }     from "../../config/stack.ts";
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
  id:            string;        // UUID v4
  name:          string;        // human label
  slug:          string;        // filesystem-safe; used as compose project + container prefix
  status:        RuntimeStatus;
  createdAt:     string;        // ISO-8601
  runtimePath:   string;        // absolute path — supabase-instances/{slug}/
  dockerPath:    string;        // absolute path — supabase-instances/{slug}/docker/
  ports:         RuntimePorts;
  secrets:       RuntimeSecrets;
  studioUrl:     string;        // http://127.0.0.1:{studio}
  healthState:   HealthState;
  snapshotState: SnapshotState;
  lastSnapshot?: string;        // ISO-8601 | undefined
}

// ── Registry ──────────────────────────────────────────────────────────────────

function registryPath(): string {
  const appData = process.env["APPDATA"] ?? join(homedir(), ".config");
  return join(appData, "unenter", "instances.json");
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
  patch: Partial<Pick<RuntimeInstance, "status" | "healthState" | "snapshotState" | "lastSnapshot">>,
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
  opts: { cwd?: string; timeout?: number } = {},
): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    const proc = spawn(cmd, args, {
      cwd:   opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
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

// ── UUID v4 (no external dependency) ─────────────────────────────────────────

function uuidV4(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20)].join("-");
}

// ── Core directories ──────────────────────────────────────────────────────────

export const CORE_DIR      = join(PROJECT_DIR, "supabase-core");
export const INSTANCES_DIR = join(PROJECT_DIR, "supabase-instances");

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

function derivePorts(timestamp: number): RuntimePorts {
  const base = 8000 + (timestamp % 1000);   // 8000–8999 range
  return {
    kong:      base,
    kongSSL:   base + 443,
    postgres:  base + 2000,
    pooler:    base + 3000,
    analytics: base + 1000,
    studio:    base + 100,
  };
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
  "supabase-edge-functions",
  "supabase-analytics",
  "supabase-db",
  "supabase-vector",
  "supabase-pooler",
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
  const coreDocker  = join(CORE_DIR, "docker");

  onLine(`→ Creating instance "${name}"  (slug: ${slug})`);

  if (!existsSync(coreDocker)) {
    throw new Error(
      `supabase-core/docker not found — run initializeSupabaseCore() first.`
    );
  }

  // Copy docker template
  await fs.mkdir(runtimePath, { recursive: true });
  onLine(`✓ Created  supabase-instances/${slug}/`);

  const isWindows = process.platform === "win32";
  const [copyCmd, copyArgs] = isWindows
    ? ["xcopy", [`"${coreDocker}"`, `"${dockerPath}"`, "/E", "/I", "/H", "/K"]]
    : ["cp",    ["-r", coreDocker, runtimePath]];

  const { code: cpCode, out: cpOut } = await spawnRun(copyCmd, copyArgs as string[]);
  if (cpCode !== 0) throw new Error(`Failed to copy docker template: ${cpOut}`);
  onLine(`✓ Docker template copied`);

  // Rewrite compose file
  const composeFile = join(dockerPath, "docker-compose.yml");
  const composeSrc  = await fs.readFile(composeFile, "utf-8");
  await fs.writeFile(composeFile, rewriteContainerNames(composeSrc, slug), "utf-8");
  onLine(`✓ Container names rewritten  (prefix: ${slug}-)`);

  // Ports + secrets
  const ports: RuntimePorts = derivePorts(timestamp);
  const secrets: RuntimeSecrets = {
    postgresPassword:  generateRandomString(32),
    jwtSecret:         generateRandomString(64),
    anonKey:           generateJWT("anon",         timestamp),
    serviceRoleKey:    generateJWT("service_role", timestamp),
    dashboardPassword: generateRandomString(16),
  };
  onLine(`✓ Ports allocated  Kong:${ports.kong}  Studio:${ports.studio}  PG:${ports.postgres}`);

  // Write .env
  const envVars: Record<string, string> = {
    POSTGRES_PASSWORD:              secrets.postgresPassword,
    JWT_SECRET:                     secrets.jwtSecret,
    ANON_KEY:                       secrets.anonKey,
    SERVICE_ROLE_KEY:               secrets.serviceRoleKey,
    DASHBOARD_USERNAME:             "supabase",
    DASHBOARD_PASSWORD:             secrets.dashboardPassword,
    SECRET_KEY_BASE:                generateRandomString(64),
    VAULT_ENC_KEY:                  generateRandomString(32),

    POSTGRES_HOST:                  "db",
    POSTGRES_DB:                    "postgres",
    POSTGRES_PORT:                  String(ports.postgres),
    KONG_HTTP_PORT:                 String(ports.kong),
    KONG_HTTPS_PORT:                String(ports.kongSSL),
    POOLER_PROXY_PORT_TRANSACTION:  String(ports.pooler),
    ANALYTICS_PORT:                 String(ports.analytics),
    STUDIO_PORT:                    String(ports.studio),

    POOLER_DEFAULT_POOL_SIZE:       "20",
    POOLER_MAX_CLIENT_CONN:         "100",
    POOLER_TENANT_ID:               `instance-${timestamp}`,
    POOLER_DB_POOL_SIZE:            "5",
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
    STUDIO_DEFAULT_ORGANIZATION:    "Default Organization",
    STUDIO_DEFAULT_PROJECT:         "Default Project",
    SUPABASE_PUBLIC_URL:            `http://localhost:${ports.kong}`,
    IMGPROXY_ENABLE_WEBP_DETECTION: "true",
    OPENAI_API_KEY:                 "",
    FUNCTIONS_VERIFY_JWT:           "false",
    LOGFLARE_PUBLIC_ACCESS_TOKEN:   generateRandomString(64),
    LOGFLARE_PRIVATE_ACCESS_TOKEN:  generateRandomString(64),
    DOCKER_SOCKET_LOCATION:         "/var/run/docker.sock",
    GOOGLE_PROJECT_ID:              "GOOGLE_PROJECT_ID",
    GOOGLE_PROJECT_NUMBER:          "GOOGLE_PROJECT_NUMBER",
  };

  await fs.writeFile(
    join(dockerPath, ".env"),
    Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join("\n"),
    "utf-8",
  );
  onLine(`✓ .env written  (${Object.keys(envVars).length} variables)`);

  // Build + register
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
    studioUrl:     `http://127.0.0.1:${ports.studio}`,
    healthState:   "unknown",
    snapshotState: "none",
  };

  await registerInstance(instance);
  onLine(`✓ Registered to instances.json  (id: ${id})`);
  onLine(`✓ Instance ready — call startCoreStack() to deploy`);

  return instance;
}
