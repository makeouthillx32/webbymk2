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
