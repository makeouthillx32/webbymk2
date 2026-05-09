// tui/db-api.ts
// ─────────────────────────────────────────────────────────────────────────────
// Supabase self-hosted stack — API client + Docker inspector + backup runner.
//
// URL translation:
//   NEXT_PUBLIC_SUPABASE_URL = http://kong:8000  (docker-internal, unusable from host)
//   KONG_HTTP_PORT           = 8001              (host-mapped port for Kong)
//   → TUI uses  http://127.0.0.1:8001  when running natively on P0W3R
//
// Services (all containers prefixed unt_):
//   unt_db        supabase/postgres:15.8.1.060      — primary Postgres
//   unt_kong      kong:2.8.1                        — API gateway
//   unt_auth      supabase/gotrue                   — GoTrue auth
//   unt_rest      postgrest/postgrest                — PostgREST
//   unt_storage   ghcr.io/supabase/storage-api      — storage API (not MinIO)
//   unt_realtime  supabase/realtime                 — WebSocket relay
//   unt_studio    supabase/studio                   — dashboard UI
//   unt_meta      supabase/postgres-meta            — pg-meta
//   unt_imgproxy  darthsim/imgproxy                 — image processing
//
// Sections:
//   checkSupaService  — HTTP (via Kong) or Docker container status check
//   backupDatabase    — pg_dump inside unt_db, streamed to OperationOverlay
//   listVolumes       — Docker volume names, drivers, mountpoints
//   listStorageBuckets — Supabase storage bucket list
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from "child_process";

// ── Connection config ─────────────────────────────────────────────────────────

/**
 * Host-accessible Kong URL.
 * Translates the docker-internal `http://kong:8000` to `http://127.0.0.1:KONG_HTTP_PORT`.
 */
export const KONG_URL = (() => {
  const explicit = process.env.SUPABASE_URL;
  if (explicit && !explicit.includes("kong") && !explicit.includes("localhost")) {
    return explicit;
  }
  const port = process.env.KONG_HTTP_PORT ?? "8001";
  return `http://127.0.0.1:${port}`;
})();

export const KONG_PORT = process.env.KONG_HTTP_PORT ?? "8001";

export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SERVICE_ROLE_KEY ?? "";

// ── Extended connection constants ─────────────────────────────────────────────

/**
 * Studio dashboard base URL.
 * Uses STUDIO_URL env var if set; otherwise falls back to localhost:STUDIO_PORT.
 * Uses `localhost` (not 127.0.0.1) — Supabase Studio binds to localhost and
 * on Windows the two don't always resolve the same way.
 * Default port is 3002 (defined in docker-compose, not shared with Kong).
 */
const STUDIO_PORT = process.env.STUDIO_PORT ?? "3002";
const DEFAULT_STUDIO_URL = `http://localhost:${STUDIO_PORT}`;
const STUDIO_URL_OVERRIDE = process.env.STUDIO_URL?.replace(/\/+$/, "");

export const STUDIO_URL =
  STUDIO_URL_OVERRIDE && !STUDIO_URL_OVERRIDE.includes(`:${KONG_PORT}`)
    ? STUDIO_URL_OVERRIDE
    : DEFAULT_STUDIO_URL;

/** Studio project URL for the core runtime. */
export const STUDIO_PROJECT_URL =
  `${STUDIO_URL}/project/${process.env.STUDIO_PROJECT ?? "default"}`;

export const STUDIO_MCP_URL =
  `${STUDIO_PROJECT_URL}?showConnect=true&connectTab=mcp`;

/**
 * Build a Studio project URL for any instance's studio port.
 * Uses localhost so the URL works on Windows regardless of IPv4/IPv6 loopback binding.
 */
export function instanceStudioUrl(studioPort: number | string): string {
  return `http://localhost:${studioPort}/project/default`;
}

export function instanceStudioMcpUrl(studioPort: number | string): string {
  return `${instanceStudioUrl(studioPort)}?showConnect=true&connectTab=mcp`;
}

/** Host-mapped Postgres port. Default 5432. */
export const POSTGRES_PORT = process.env.POSTGRES_PORT ?? "5432";

/** Postgres password from env (may be empty if the TUI process doesn't load docker .env). */
export const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD ?? "";

/** Direct Postgres connection string for the core unt_db container. */
export function postgresConnStr(password?: string): string {
  const pw = password ?? POSTGRES_PASSWORD;
  const masked = pw ? pw : "***";
  return `postgresql://postgres:${masked}@127.0.0.1:${POSTGRES_PORT}/postgres`;
}

// ── Rich copy text builders ───────────────────────────────────────────────────

/**
 * Build the full connection info sheet — suitable for pasting into docs,
 * a README, or an AI tool context window.
 *
 * Truncates keys at 80 chars to keep the output readable in most editors.
 */
export function buildConnectionSheet(opts: {
  label?:    string;
  kongUrl?:  string;
  studioUrl?: string;
  studioMcpUrl?: string;
  anonKey?:  string;
  svcKey?:   string;
  pgConn?:   string;
} = {}): string {
  const label     = opts.label     ?? "Supabase Core Runtime";
  const kongUrl   = opts.kongUrl   ?? KONG_URL;
  const studioUrl = opts.studioUrl ?? STUDIO_PROJECT_URL;
  const studioMcpUrl = opts.studioMcpUrl ?? STUDIO_MCP_URL;
  const anon      = opts.anonKey   ?? ANON_KEY;
  const svc       = opts.svcKey    ?? SERVICE_KEY;
  const pg        = opts.pgConn    ?? postgresConnStr();

  const truncate = (s: string, n = 80) =>
    s.length > n ? s.slice(0, n) + "..." : s;

  return [
    `== ${label} — Connection Info ==`,
    "",
    `Studio      ${studioUrl}`,
    `Studio MCP  ${studioMcpUrl}`,
    `API (Kong)  ${kongUrl}`,
    `REST        ${kongUrl}/rest/v1/`,
    `Auth        ${kongUrl}/auth/v1/`,
    `Storage     ${kongUrl}/storage/v1/`,
    "",
    `Postgres    ${pg}`,
    "",
    `ANON_KEY`,
    truncate(anon || "(not loaded — check .env)"),
    "",
    `SERVICE_ROLE_KEY`,
    truncate(svc || "(not loaded — check .env)"),
    "",
    `== MCP Config (postgres direct) ==`,
    JSON.stringify({
      mcpServers: {
        "supabase-local": {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-postgres", pg],
        },
      },
    }, null, 2),
    "",
    `== MCP Config (Supabase API) ==`,
    JSON.stringify({
      mcpServers: {
        "supabase-api": {
          command: "npx",
          args: ["-y", "@supabase/mcp-server-supabase@latest"],
          env: {
            SUPABASE_URL:              kongUrl,
            SUPABASE_SERVICE_ROLE_KEY: svc || "(paste key here)",
          },
        },
      },
    }, null, 2),
  ].join("\n");
}

/**
 * Build just the MCP config block — for quick paste into claude_desktop_config.json.
 */
export function buildMcpConfig(opts: {
  kongUrl?: string;
  svcKey?:  string;
  pgConn?:  string;
} = {}): string {
  const kongUrl = opts.kongUrl ?? KONG_URL;
  const svc     = opts.svcKey  ?? SERVICE_KEY;
  const pg      = opts.pgConn  ?? postgresConnStr();

  return JSON.stringify({
    mcpServers: {
      "supabase-local": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres", pg],
      },
      "supabase-api": {
        command: "npx",
        args: ["-y", "@supabase/mcp-server-supabase@latest"],
        env: {
          SUPABASE_URL:              kongUrl,
          SUPABASE_SERVICE_ROLE_KEY: svc || "(paste key here)",
        },
      },
    },
  }, null, 2);
}

export const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.ANON_KEY ?? "";

const COMPOSE_PROJECT = "webbymk2";

// ── Supabase service definitions ──────────────────────────────────────────────

export interface SupaService {
  label:     string;
  container: string;   // docker container name (unt_*)
  desc:      string;
  /** HTTP path appended to baseUrl (or KONG_URL). null = docker inspect check. */
  path:      string | null;
  /**
   * Override base URL for HTTP checks.
   * Useful for services not accessible via Kong (e.g. Studio on its host port).
   * Only used when path !== null.
   */
  baseUrl?:  string;
}

export interface SupaResult {
  status:    "up" | "down" | "checking" | "unknown";
  ms:        number | null;
  code:      number | null;   // HTTP code, or null for container checks
  checkKind: "http" | "container";
}

/**
 * All Supabase stack services.
 * HTTP services (path !== null) are checked via Kong endpoint.
 * Container services (path === null) are checked via `docker inspect`.
 * Postgres is first — it's the root dependency everything else needs.
 */
export const SUPA_SERVICES: SupaService[] = [
  // Core — container checks (docker inspect) for services not accessible via Kong.
  // Studio is the exception: its image ships a broken HEALTHCHECK so docker inspect
  // incorrectly reports "unhealthy" even when Next.js is serving.  Use a direct
  // HTTP check on the host-mapped port (3002:3000) instead.
  { label: "Postgres",  container: "unt_db",       desc: "primary database",  path: null                                                   },
  { label: "Studio",    container: "unt_studio",   desc: "dashboard UI",      path: "/", baseUrl: "http://127.0.0.1:3002"                   },
  { label: "Meta",      container: "unt_meta",     desc: "pg-meta",           path: null                                                   },
  { label: "ImgProxy",  container: "unt_imgproxy", desc: "image proxy",       path: null                                                   },
  // API services (HTTP checks via Kong)
  { label: "Kong",      container: "unt_kong",      desc: "API gateway",       path: "/"                     },
  { label: "Auth",      container: "unt_auth",      desc: "GoTrue",            path: "/auth/v1/health"       },
  { label: "REST",      container: "unt_rest",      desc: "PostgREST",         path: "/rest/v1/"             },
  { label: "Storage",   container: "unt_storage",   desc: "storage-api",       path: "/storage/v1/status"    },
  // Realtime is a Phoenix WebSocket server — no plain HTTP health route via Kong.
  // Docker inspect gives reliable running/healthy state without the 404 noise.
  { label: "Realtime",  container: "unt_realtime",  desc: "WebSockets",        path: null                    },
];

// ── Docker helpers ────────────────────────────────────────────────────────────

const DOCKER_ENV: Record<string, string> = {
  ...(process.env as Record<string, string>),
  ...(process.platform !== "win32"
    ? { DOCKER_HOST: "unix:///var/run/docker.sock" }
    : {}),
};

function dockerRun(args: string[]): Promise<{ out: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("docker", args, {
      env:   DOCKER_ENV,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    proc.stdout!.on("data", (d: Buffer) => { out += d.toString(); });
    proc.stderr!.on("data", () => {});
    proc.on("close", (code) => resolve({ out: out.trim(), code: code ?? 1 }));
    proc.on("error", ()     => resolve({ out: "", code: 1 }));
  });
}

// ── Service checks ────────────────────────────────────────────────────────────

/** HTTP health check — uses svc.baseUrl if set, otherwise falls back to KONG_URL. */
async function checkHttp(svc: SupaService): Promise<SupaResult> {
  const base  = svc.baseUrl ?? KONG_URL;
  const url   = `${base}${svc.path}`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    // Only send Kong auth headers when using the Kong base URL
    const headers: Record<string, string> = {};
    if (!svc.baseUrl && SERVICE_KEY) {
      headers["Authorization"] = `Bearer ${SERVICE_KEY}`;
      headers["apikey"]        = SERVICE_KEY;
    }
    const res = await fetch(url, {
      headers, signal: controller.signal, redirect: "manual" as RequestRedirect,
    });
    clearTimeout(timer);
    return {
      status: res.status < 500 ? "up" : "down",
      ms: Date.now() - start, code: res.status, checkKind: "http",
    };
  } catch {
    return { status: "down", ms: null, code: null, checkKind: "http" };
  }
}

/** Docker container status check for services without an HTTP path. */
async function checkContainer(svc: SupaService): Promise<SupaResult> {
  const { out, code } = await dockerRun([
    "inspect",
    "--format", "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}",
    svc.container,
  ]);
  if (code !== 0) return { status: "down", ms: null, code: null, checkKind: "container" };

  const [state, health] = out.split("|");
  if (state !== "running")       return { status: "down",     ms: null, code: null, checkKind: "container" };
  if (health === "unhealthy")    return { status: "down",     ms: null, code: null, checkKind: "container" };
  if (health === "starting")     return { status: "checking", ms: null, code: null, checkKind: "container" };
  return                                { status: "up",       ms: null, code: null, checkKind: "container" };
}

/** Dispatch to HTTP or container check based on svc.path. */
export async function checkSupaService(svc: SupaService): Promise<SupaResult> {
  return svc.path !== null ? checkHttp(svc) : checkContainer(svc);
}

// ── Database backup ───────────────────────────────────────────────────────────

/**
 * Run pg_dump inside unt_db and save to a timestamped .sql.gz file.
 * The file is saved inside the container at /var/lib/postgresql/data/backups/
 * (which is on the webbymk2_db-data volume, so it persists).
 * Streams progress to onLine for the OperationOverlay.
 */
export async function backupDatabase(onLine: (l: string) => void): Promise<number> {
  const ts   = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const file = `/var/lib/postgresql/data/backups/dump_${ts}.sql.gz`;

  onLine(`Container : unt_db`);
  onLine(`Database  : postgres`);
  onLine(`Format    : pg_dump | gzip`);
  onLine(`Dest      : ${file}  (on db-data volume)`);
  onLine("");

  // Ensure backup dir exists inside the container
  const { code: mkCode } = await dockerRun([
    "exec", "unt_db", "mkdir", "-p", "/var/lib/postgresql/data/backups",
  ]);
  if (mkCode !== 0) {
    onLine("✗ Could not create backup directory inside unt_db");
    return 1;
  }

  // Stream pg_dump + gzip
  return new Promise((resolve) => {
    const proc = spawn("docker", [
      "exec", "unt_db",
      "sh", "-c",
      `pg_dump -U postgres postgres | gzip > ${file} && echo "✓ Saved: ${file}" && echo "✓ $(gzip -l ${file} | tail -1)"`,
    ], { env: DOCKER_ENV, stdio: ["ignore", "pipe", "pipe"] });

    proc.stdout!.on("data", (d: Buffer) => {
      d.toString().split("\n").filter(Boolean).forEach(onLine);
    });
    proc.stderr!.on("data", (d: Buffer) => {
      // pg_dump writes progress to stderr — show it
      d.toString().split("\n").filter(Boolean).forEach((l) => onLine(`  ${l}`));
    });
    proc.on("close",  (code) => resolve(code ?? 1));
    proc.on("error",  ()     => { onLine("✗ docker exec failed"); resolve(1); });
  });
}

// ── Docker volumes ────────────────────────────────────────────────────────────

export interface VolumeInfo {
  name:       string;
  driver:     string;
  mountpoint: string;
}

export async function listVolumes(): Promise<VolumeInfo[]> {
  const { out: namesOut, code } = await dockerRun([
    "volume", "ls",
    "--filter", `name=${COMPOSE_PROJECT}`,
    "--format", "{{.Name}}",
  ]);
  if (code !== 0 || !namesOut) return [];

  const names = namesOut.split("\n").map(n => n.trim()).filter(Boolean);
  if (names.length === 0) return [];

  const { out: inspectOut } = await dockerRun([
    "volume", "inspect",
    "--format", "{{.Name}}\t{{.Driver}}\t{{.Mountpoint}}",
    ...names,
  ]);
  if (!inspectOut) return [];

  return inspectOut.split("\n")
    .map(line => {
      const [name, driver, mountpoint] = line.split("\t");
      if (!name) return null;
      return { name, driver: driver ?? "local", mountpoint: mountpoint ?? "" };
    })
    .filter((v): v is VolumeInfo => v !== null);
}

// ── Storage buckets ───────────────────────────────────────────────────────────

export interface BucketInfo {
  id:            string;
  name:          string;
  isPublic:      boolean;
  fileSizeLimit: number | null;
  createdAt:     string;
}

export async function listStorageBuckets(): Promise<BucketInfo[]> {
  if (!SERVICE_KEY) throw new Error("SERVICE_ROLE_KEY not set in .env");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const res = await fetch(`${KONG_URL}/storage/v1/bucket`, {
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 401) throw new Error("Storage auth failed — check SERVICE_ROLE_KEY");
    if (!res.ok)            throw new Error(`Storage API (${res.status})`);
    const raw = await res.json() as Array<{
      id: string; name: string; public: boolean;
      file_size_limit: number | null; created_at: string;
    }>;
    return raw.map(b => ({
      id: b.id, name: b.name, isPublic: b.public,
      fileSizeLimit: b.file_size_limit, createdAt: b.created_at,
    }));
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Core Runtime Lifecycle Engine — Phase 2
// ═════════════════════════════════════════════════════════════════════════════
//
// These functions manage the full lifecycle of a RuntimeInstance:
//
//   startCoreStack()    — docker compose up -d --remove-orphans
//   stopCoreStack()     — docker compose stop
//   restartCoreStack()  — stop → start
//   healCoreStack()     — detect + recover ghost/dead containers
//   verifyCoreStack()   — check all containers and return health report
//
// Each accepts a RuntimeInstance (from supabase-factory.ts registry) so the
// control plane always knows exactly which compose project it is talking to.
// Progress is streamed via the OnLine callback (OperationOverlay compatible).
// ─────────────────────────────────────────────────────────────────────────────

import type { RuntimeInstance, HealthState } from "./zone/supabase-factory.ts";
import { updateInstanceStatus }              from "./zone/supabase-factory.ts";

type OnLine = (line: string) => void;

// ── Compose runner ────────────────────────────────────────────────────────────
// Streams stdout + stderr to onLine; resolves with exit code.

function composeStream(
  args:   string[],
  cwd:    string,
  onLine: OnLine,
  timeout = 300_000,
): Promise<number> {
  return new Promise((resolve) => {
    const { spawn: spawnProc } = require("child_process") as typeof import("child_process");
    const proc = spawnProc("docker", ["compose", ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env:   DOCKER_ENV,
    });

    const timer = setTimeout(() => {
      onLine("⏱ Timeout — killing compose process");
      proc.kill();
    }, timeout);

    proc.stdout!.on("data", (d: Buffer) => {
      d.toString().split("\n").filter(Boolean).forEach(onLine);
    });
    proc.stderr!.on("data", (d: Buffer) => {
      d.toString().split("\n").filter(Boolean).forEach((l) => onLine(`  ${l}`));
    });
    proc.on("close",  (code) => { clearTimeout(timer); resolve(code ?? 1); });
    proc.on("error",  ()     => { clearTimeout(timer); onLine("✗ docker compose not found"); resolve(1); });
  });
}

// ── startCoreStack ────────────────────────────────────────────────────────────

/**
 * Start a runtime instance.
 * Runs: docker compose up -d --remove-orphans
 * Updates registry status to "active" on success, "error" on failure.
 */
export async function startCoreStack(
  instance: RuntimeInstance,
  onLine:   OnLine,
): Promise<boolean> {
  onLine(`▶ Starting  ${instance.name}  (${instance.slug})`);
  onLine(`  compose dir: ${instance.dockerPath}`);

  await updateInstanceStatus(instance.id, { status: "creating" });

  const code = await composeStream(
    ["up", "-d", "--remove-orphans"],
    instance.dockerPath,
    onLine,
    300_000,
  );

  if (code !== 0) {
    onLine(`✗ docker compose up failed (exit ${code})`);
    await updateInstanceStatus(instance.id, { status: "error", healthState: "down" });
    return false;
  }

  onLine(`✓ Stack started`);
  await updateInstanceStatus(instance.id, { status: "active", healthState: "unknown" });
  return true;
}

// ── stopCoreStack ─────────────────────────────────────────────────────────────

/**
 * Stop a runtime instance (containers stopped, volumes preserved).
 * Runs: docker compose stop
 */
export async function stopCoreStack(
  instance: RuntimeInstance,
  onLine:   OnLine,
): Promise<boolean> {
  onLine(`■ Stopping  ${instance.name}  (${instance.slug})`);

  const code = await composeStream(
    ["stop"],
    instance.dockerPath,
    onLine,
    120_000,
  );

  if (code !== 0) {
    onLine(`⚠ docker compose stop returned exit ${code} — containers may already be stopped`);
  } else {
    onLine(`✓ Stack stopped`);
  }

  await updateInstanceStatus(instance.id, { status: "stopped", healthState: "down" });
  return code === 0;
}

// ── restartCoreStack ──────────────────────────────────────────────────────────

/** Stop then start a runtime instance. */
export async function restartCoreStack(
  instance: RuntimeInstance,
  onLine:   OnLine,
): Promise<boolean> {
  onLine(`↺ Restarting  ${instance.name}`);
  await stopCoreStack(instance, onLine);
  return startCoreStack(instance, onLine);
}

// ── healCoreStack ─────────────────────────────────────────────────────────────

/**
 * Detect and recover a degraded runtime:
 *   1. List all containers for the compose project
 *   2. Identify ghost containers (exited / dead / missing networks)
 *   3. Attempt docker compose up -d --remove-orphans to rehydrate
 *
 * Future extensions: volume integrity check, checksum validation, snapshot
 * fallback recovery.
 */
export async function healCoreStack(
  instance: RuntimeInstance,
  onLine:   OnLine,
): Promise<boolean> {
  onLine(`⚕ Healing  ${instance.name}  (${instance.slug})`);

  // Step 1 — audit current state
  const { out: psOut } = await dockerRun([
    "compose", "--project-name", instance.slug,
    "ps", "--format", "json",
  ]);

  let ghosts = 0;
  let missing = 0;

  if (psOut) {
    try {
      // docker compose ps --format json can emit one JSON object per line
      const rows = psOut
        .split("\n")
        .filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean) as Array<{ State: string; Name: string }>;

      for (const row of rows) {
        if (row.State === "exited" || row.State === "dead") {
          onLine(`  ⚠ Ghost container: ${row.Name}  (${row.State})`);
          ghosts++;
        }
      }
    } catch {
      onLine(`  ⚠ Could not parse compose ps output`);
    }
  } else {
    onLine(`  ⚠ No containers found for project ${instance.slug}`);
    missing++;
  }

  if (ghosts === 0 && missing === 0) {
    onLine(`  ✓ No ghost containers detected`);
  }

  // Step 2 — check for missing networks
  const { out: netOut } = await dockerRun([
    "network", "ls", "--filter", `name=${instance.slug}`, "--format", "{{.Name}}",
  ]);
  if (!netOut.includes(instance.slug)) {
    onLine(`  ⚠ Compose network missing — will be recreated on up`);
  }

  // Step 3 — rehydrate
  onLine(`  ↺ Running docker compose up -d --remove-orphans to rehydrate...`);
  const code = await composeStream(
    ["up", "-d", "--remove-orphans"],
    instance.dockerPath,
    onLine,
    300_000,
  );

  if (code !== 0) {
    onLine(`✗ Heal failed (exit ${code}) — manual intervention may be required`);
    await updateInstanceStatus(instance.id, { status: "error", healthState: "down" });
    return false;
  }

  onLine(`✓ Heal complete — stack rehydrated`);
  await updateInstanceStatus(instance.id, { status: "active", healthState: "unknown" });
  return true;
}

// ── verifyCoreStack ───────────────────────────────────────────────────────────

export interface VerifyReport {
  slug:       string;
  overall:    HealthState;
  containers: Array<{ name: string; state: string; health: string }>;
  runningCount: number;
  totalCount:   number;
}

/**
 * Inspect all containers in a runtime instance and return a health report.
 * Does not modify registry state — purely observational.
 */
export async function verifyCoreStack(
  instance: RuntimeInstance,
  onLine?:  OnLine,
): Promise<VerifyReport> {
  const log = onLine ?? (() => {});
  log(`🔍 Verifying  ${instance.name}  (${instance.slug})`);

  const { out: psOut, code } = await dockerRun([
    "compose", "--project-name", instance.slug,
    "ps", "--format", "json",
  ]);

  if (code !== 0 || !psOut) {
    log(`  ✗ No containers found`);
    const report: VerifyReport = {
      slug: instance.slug, overall: "down",
      containers: [], runningCount: 0, totalCount: 0,
    };
    await updateInstanceStatus(instance.id, { healthState: "down" });
    return report;
  }

  const rows = psOut
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as Array<{ Name: string; State: string; Health: string }>;

  const containers = rows.map((r) => ({
    name:   r.Name   ?? "unknown",
    state:  r.State  ?? "unknown",
    health: r.Health ?? "",
  }));

  const running = containers.filter((c) => c.state === "running").length;
  const total   = containers.length;

  containers.forEach((c) => {
    const icon = c.state === "running" ? "✓" : "✗";
    log(`  ${icon} ${c.name.padEnd(40)} ${c.state}${c.health ? ` (${c.health})` : ""}`);
  });

  const unhealthy = containers.some((c) => c.health === "unhealthy");
  const allUp     = running === total && total > 0;
  const overall: HealthState = allUp && !unhealthy ? "healthy"
    : running > 0                                  ? "degraded"
    : "down";

  log(`  → ${running}/${total} running  —  ${overall}`);

  await updateInstanceStatus(instance.id, { healthState: overall });

  return { slug: instance.slug, overall, containers, runningCount: running, totalCount: total };
}

// ── deleteRuntimeInstance ─────────────────────────────────────────────────────

/**
 * Fully remove a runtime instance:
 *   1. docker compose down --volumes --remove-orphans
 *   2. Remove instance directory from filesystem
 *   3. Remove from JSON registry
 */
export async function deleteRuntimeInstance(
  instance: RuntimeInstance,
  onLine:   OnLine,
): Promise<boolean> {
  onLine(`🗑 Deleting  ${instance.name}  (${instance.slug})`);

  // Step 1 — tear down containers + volumes
  onLine(`  ↓ docker compose down --volumes --remove-orphans`);
  const code = await composeStream(
    ["down", "--volumes", "--remove-orphans"],
    instance.dockerPath,
    onLine,
    120_000,
  );
  if (code !== 0) {
    onLine(`  ⚠ compose down returned ${code} — continuing with filesystem cleanup`);
  }

  // Step 2 — remove instance directory
  try {
    const { rm } = await import("fs/promises");
    await rm(instance.runtimePath, { recursive: true, force: true });
    onLine(`  ✓ Removed ${instance.runtimePath}`);
  } catch (e) {
    onLine(`  ⚠ Could not remove directory: ${e instanceof Error ? e.message : e}`);
  }

  // Step 3 — deregister
  const { removeFromRegistry } = await import("./zone/supabase-factory.ts");
  await removeFromRegistry(instance.id);
  onLine(`✓ Instance deleted and removed from registry`);
  return true;
}
