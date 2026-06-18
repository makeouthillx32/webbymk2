// src/ink/zone/snapshot.ts
// ─────────────────────────────────────────────────────────────────────────────
// Snapshot System — Phase 4 of the Core Runtime Control Plane.
//
// A valid snapshot bundle contains everything needed to:
//   • Restore after corruption or data loss          → restoreInstance()
//   • Move the runtime to a different machine
//   • Clone the environment for a new instance       → cloneFromBundle()
//   • Rehydrate from scratch using only Docker + the bundle
//   • Seed a fresh instance with zero data           → captureTemplate()
//
// Bundle layout (directory):
//   {backupsDir}/{slug}/{timestamp}/
//     db.dump          — pg_dump custom-format (binary, compressed)
//     schema.sql       — pg_dump schema-only (human-readable reference)
//     storage/         — Supabase storage objects (docker cp)
//     env.redacted     — .env with secrets replaced by placeholders
//     compose.yml      — docker-compose.yml snapshot
//     metadata.json    — instance metadata + bundle manifest
//     restore.sh       — Linux/macOS restore script
//     restore.ps1      — Windows PowerShell restore script
//
// Archive (sits next to the directory):
//   {backupsDir}/{slug}/{timestamp}.tar.gz   — compressed portable bundle
//
// Template bundles (vanilla Supabase, no user data):
//   {backupsDir}/templates/fresh-{date}.tar.gz
//
// Exports:
//   snapshotInstance(instance, onLine)              → SnapshotBundle
//   restoreInstance(bundlePath, onLine)             → exit code
//   cloneFromBundle(bundlePath, newSlug, cfg, onLine) → CloneResult
//   packBundle(bundlePath)                          → archivePath | null
//   listSnapshots(instance)                         → SnapshotBundle[]
//   captureTemplate(onLine, maxAgeDays?)            → TemplateBundle
//   listTemplates()                                 → TemplateBundle[]
// ─────────────────────────────────────────────────────────────────────────────

import { promises as fs, existsSync, createReadStream } from "fs";
import { join, dirname }  from "path";
import { spawn }          from "child_process";
import { PROJECT_DIR }    from "../../config/stack.ts";
import {
  updateInstanceStatus,
  spawnRun,
  envWithFile,
  loadRegistry,
  removeFromRegistry,
  registerInstance,
  createRuntimeInstance,
  type RuntimeInstance,
} from "./supabase-factory.ts";
import type { OnLine } from "./types.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnapshotBundle {
  id:           string;   // ISO timestamp slug, e.g. "2026-05-08_14-30-00"
  instanceId:   string;
  instanceSlug: string;
  createdAt:    string;   // ISO-8601
  bundlePath:   string;   // absolute path to bundle directory
  archivePath?: string;   // path to .tar.gz, set after compression
  files: {
    dbDump:      string;
    schemaSql:   string;
    envRedacted: string;
    composeYml:  string;
    metadata:    string;
    restoreSh:   string;
    restorePs1:  string;
  };
}

export interface CloneConfig {
  /** Absolute path to the project root the clone will live in. */
  targetDir:    string;
  /** Ports for the new instance — must not conflict with existing zones. */
  ports: {
    postgres:   number;
    studio:     number;
    kong:       number;
    kongSSL:    number;
  };
  /** Docker compose project name — defaults to newSlug. */
  projectName?: string;
}

export interface CloneResult {
  slug:      string;
  bundlePath: string;
  studioUrl:  string;
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const BACKUPS_DIR   = join(PROJECT_DIR, "backups", "supabase-core");
export const TEMPLATES_DIR = join(BACKUPS_DIR, "templates");

// ── Template types ────────────────────────────────────────────────────────────

/**
 * A "fresh template" bundle — a vanilla Supabase snapshot with zero user data.
 * Used as the seed for cloneFromBundle() when creating new blank instances.
 */
export interface TemplateBundle {
  /** Date string, e.g. "2026-05-25". Used as the archive filename. */
  version:     string;
  createdAt:   string;   // ISO-8601
  /** Absolute path to the .tar.gz archive. */
  archivePath: string;
  /** Absolute path to the raw bundle directory (may not exist if archived only). */
  bundlePath:  string;
}

// ── Spawn helpers ─────────────────────────────────────────────────────────────

function dockerStream(
  args:    string[],
  onLine:  OnLine,
  timeout = 300_000,
): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      onLine("⏱ Snapshot timeout — killing process");
      proc.kill();
    }, timeout);

    proc.stdout!.on("data", (d: Buffer) => {
      d.toString().split("\n").filter(Boolean).forEach(onLine);
    });
    proc.stderr!.on("data", (d: Buffer) => {
      d.toString().split("\n").filter(Boolean).forEach((l) => onLine(`  ${l}`));
    });
    proc.on("close",  (code) => { clearTimeout(timer); resolve(code ?? 1); });
    proc.on("error",  ()     => { clearTimeout(timer); onLine("✗ docker not found"); resolve(1); });
  });
}

async function dockerExec(args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const proc = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout!.on("data", (d: Buffer) => { out += d.toString(); });
    proc.stderr!.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", (code) => resolve({ code: code ?? 1, out: out.trim() }));
    proc.on("error", ()     => resolve({ code: 1, out }));
  });
}

// ── Container name helpers ────────────────────────────────────────────────────
//
// Runtime instances use "{slug}-{service}"  (e.g. myapp-db, myapp-storage)
// The core stack uses the "unt_" prefix     (e.g. unt_db,   unt_storage)
// containerPrefix (if set) already includes the separator ("unt_" vs "myapp-")

function dbContainer(instance: RuntimeInstance): string {
  return instance.containerPrefix
    ? `${instance.containerPrefix}db`
    : `${instance.slug}-db`;
}

function storageContainer(instance: RuntimeInstance): string {
  return instance.containerPrefix
    ? `${instance.containerPrefix}storage`
    : `${instance.slug}-storage`;
}

// ── Redact .env secrets ───────────────────────────────────────────────────────

const SECRET_KEYS = new Set([
  "POSTGRES_PASSWORD", "JWT_SECRET", "ANON_KEY", "SERVICE_ROLE_KEY",
  "DASHBOARD_PASSWORD", "SECRET_KEY_BASE", "VAULT_ENC_KEY",
  "LOGFLARE_PUBLIC_ACCESS_TOKEN", "LOGFLARE_PRIVATE_ACCESS_TOKEN",
]);

function redactEnv(envContent: string): string {
  return envContent
    .split("\n")
    .map((line) => {
      const eq = line.indexOf("=");
      if (eq < 0) return line;
      const key = line.slice(0, eq).trim();
      return SECRET_KEYS.has(key) ? `${key}=<REDACTED>` : line;
    })
    .join("\n");
}

// ── Restore script generators ─────────────────────────────────────────────────

function generateRestoreSh(
  bundle:   Omit<SnapshotBundle, "files">,
  instance: RuntimeInstance,
  dbCont:   string,
): string {
  return `#!/usr/bin/env bash
# Restore script — generated ${bundle.createdAt}
# Instance: ${instance.name}  (${instance.slug})
#
# Requirements: docker, docker compose, bash
# Usage: bash restore.sh
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTANCE_SLUG="${instance.slug}"
DB_CONTAINER="${dbCont}"

echo "==> Restoring instance: ${instance.name}"
echo "    Bundle: \$BUNDLE_DIR"
echo "    DB container: \$DB_CONTAINER"
echo ""

# 1. Bring compose stack up (must be running for pg_restore)
echo "[1/4] Starting compose stack..."
docker compose --project-name "\$INSTANCE_SLUG" -f "\$BUNDLE_DIR/compose.yml" up -d --remove-orphans

echo "      Waiting 20s for Postgres to be ready..."
sleep 20

# 2. Restore pg_dump into the running Postgres container
echo "[2/4] Restoring database..."
docker cp "\$BUNDLE_DIR/db.dump" "\$DB_CONTAINER:/restore/db.dump"
docker exec "\$DB_CONTAINER" pg_restore \\
  --host=localhost --username=postgres --dbname=postgres \\
  --clean --if-exists --no-owner --no-privileges \\
  /restore/db.dump || echo "  pg_restore returned non-zero — check output above"

# 3. Restore storage objects
echo "[3/4] Restoring storage objects..."
STORAGE_CONTAINER="\${INSTANCE_SLUG}-storage"
if [ -d "\$BUNDLE_DIR/storage" ]; then
  docker cp "\$BUNDLE_DIR/storage/." "\$STORAGE_CONTAINER:/var/lib/storage/" && echo "  ✓ storage restored" || echo "  ⚠ storage restore failed"
fi

echo "[4/4] Done. Studio: http://127.0.0.1:${instance.ports.studio}"
echo ""
echo "NOTE: Regenerate secrets before exposing this instance publicly."
echo "      Copy env.redacted to .env and fill in the <REDACTED> values."
`;
}

function generateRestorePs1(
  bundle:   Omit<SnapshotBundle, "files">,
  instance: RuntimeInstance,
  dbCont:   string,
): string {
  return `# Restore script — generated ${bundle.createdAt}
# Instance: ${instance.name}  (${instance.slug})
#
# Requirements: docker, docker compose, PowerShell 7+
# Usage: pwsh restore.ps1
$ErrorActionPreference = "Stop"

$BundleDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstanceSlug = "${instance.slug}"
$DbContainer  = "${dbCont}"
$StgContainer = "$InstanceSlug-storage"

Write-Host "==> Restoring instance: ${instance.name}"
Write-Host "    Bundle: $BundleDir"
Write-Host ""

# 1. Start stack
Write-Host "[1/4] Starting compose stack..."
docker compose --project-name $InstanceSlug -f "$BundleDir/compose.yml" up -d --remove-orphans
Write-Host "      Waiting 20s for Postgres..."
Start-Sleep -Seconds 20

# 2. Restore database
Write-Host "[2/4] Restoring database..."
docker cp "$BundleDir/db.dump" "\${DbContainer}:/restore/db.dump"
docker exec $DbContainer pg_restore \`
  --host=localhost --username=postgres --dbname=postgres \`
  --clean --if-exists --no-owner --no-privileges /restore/db.dump

# 3. Restore storage
Write-Host "[3/4] Restoring storage objects..."
if (Test-Path "$BundleDir/storage") {
  docker cp "$BundleDir/storage/." "\${StgContainer}:/var/lib/storage/"
  Write-Host "  storage restored"
}

Write-Host "[4/4] Done. Studio: http://127.0.0.1:${instance.ports.studio}"
Write-Host ""
Write-Host "NOTE: Copy env.redacted to .env and fill in the <REDACTED> values before use."
`;
}

// ── packBundle ────────────────────────────────────────────────────────────────

/**
 * Compress a bundle directory into a .tar.gz archive in the same parent folder.
 * Archive path: {parentDir}/{bundleDirName}.tar.gz
 * Returns the archive path on success, null on failure.
 */
export async function packBundle(bundlePath: string): Promise<string | null> {
  const bundleName  = bundlePath.split(/[\\/]/).pop()!;
  const archivePath = join(dirname(bundlePath), `${bundleName}.tar.gz`);

  const { code } = await spawnRun(
    "tar",
    ["-czf", archivePath, "-C", dirname(bundlePath), bundleName],
  );

  if (code !== 0) return null;
  return archivePath;
}

// ── snapshotInstance ──────────────────────────────────────────────────────────

/**
 * Create a full snapshot bundle for a RuntimeInstance.
 *
 * Steps:
 *   1. pg_dump (custom format — binary, pg_restore compatible)
 *   2. pg_dump (schema only — human-readable reference)
 *   3. Storage objects (docker cp)
 *   4. env.redacted
 *   5. compose.yml
 *   6. metadata.json + restore scripts
 *   7. Compress → {timestamp}.tar.gz
 *
 * Streams progress to onLine. Updates instance snapshotState in the registry.
 * Returns the SnapshotBundle descriptor on success. Throws on failure.
 */
export async function snapshotInstance(
  instance: RuntimeInstance,
  onLine:   OnLine,
): Promise<SnapshotBundle> {
  const now        = new Date();
  const tsSlug     = now.toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const bundlePath = join(BACKUPS_DIR, instance.slug, tsSlug);

  onLine(`📸 Snapshotting  ${instance.name}  →  ${bundlePath}`);

  await updateInstanceStatus(instance.id, { snapshotState: "pending" });

  // ── Create bundle directory ───────────────────────────────────────────────
  await fs.mkdir(bundlePath, { recursive: true });
  const storagePath = join(bundlePath, "storage");
  await fs.mkdir(storagePath, { recursive: true });

  const files = {
    dbDump:      join(bundlePath, "db.dump"),
    schemaSql:   join(bundlePath, "schema.sql"),
    envRedacted: join(bundlePath, "env.redacted"),
    composeYml:  join(bundlePath, "compose.yml"),
    metadata:    join(bundlePath, "metadata.json"),
    restoreSh:   join(bundlePath, "restore.sh"),
    restorePs1:  join(bundlePath, "restore.ps1"),
  };

  const db      = dbContainer(instance);
  const storage = storageContainer(instance);

  // ── Ensure backup dir inside container ───────────────────────────────────
  await dockerExec(["exec", db, "mkdir", "-p", "/restore"]);

  // ── [1/7] pg_dump custom format ──────────────────────────────────────────
  onLine(`  [1/7] pg_dump (custom format)...`);
  const dumpCode = await dockerStream([
    "exec", db,
    "sh", "-c",
    `pg_dump -U postgres -Fc postgres > /restore/db.dump && echo "✓ db.dump written"`,
  ], onLine);
  if (dumpCode !== 0) {
    await updateInstanceStatus(instance.id, { snapshotState: "error" });
    throw new Error(`pg_dump failed (exit ${dumpCode})`);
  }
  const { code: cpDumpCode } = await dockerExec(["cp", `${db}:/restore/db.dump`, files.dbDump]);
  if (cpDumpCode !== 0) throw new Error("docker cp db.dump failed");
  const dumpStat = await fs.stat(files.dbDump);
  onLine(`  ✓ db.dump  (${(dumpStat.size / 1024 / 1024).toFixed(1)} MB)`);

  // ── [2/7] pg_dump schema only ─────────────────────────────────────────────
  onLine(`  [2/7] pg_dump (schema only)...`);
  await dockerStream([
    "exec", db,
    "sh", "-c",
    `pg_dump -U postgres -s postgres > /restore/schema.sql && echo "✓ schema.sql written"`,
  ], onLine);
  await dockerExec(["cp", `${db}:/restore/schema.sql`, files.schemaSql]);
  onLine(`  ✓ schema.sql`);

  // ── [3/7] Storage objects ─────────────────────────────────────────────────
  onLine(`  [3/7] Storage objects from ${storage}...`);
  const { code: cpStorageCode, out: cpStorageOut } = await dockerExec([
    "cp", `${storage}:/var/lib/storage/.`, storagePath,
  ]);
  if (cpStorageCode !== 0) {
    onLine(`  ⚠ Storage copy exit ${cpStorageCode}: ${cpStorageOut}`);
    onLine(`      (storage/ will be empty in this bundle)`);
  } else {
    onLine(`  ✓ storage objects  →  bundle/storage/`);
  }

  // ── [4/7] env.redacted ────────────────────────────────────────────────────
  onLine(`  [4/7] env.redacted...`);
  const envSrc = join(instance.dockerPath, ".env");
  if (existsSync(envSrc)) {
    const envContent = await fs.readFile(envSrc, "utf-8");
    await fs.writeFile(files.envRedacted, redactEnv(envContent), "utf-8");
    onLine(`  ✓ env.redacted  (secrets replaced with <REDACTED>)`);
  } else {
    onLine(`  ⚠ .env not found — skipping`);
  }

  // ── [5/7] compose.yml ─────────────────────────────────────────────────────
  onLine(`  [5/7] compose.yml...`);
  const composeSrc = join(instance.dockerPath, "docker-compose.yml");
  if (existsSync(composeSrc)) {
    await fs.copyFile(composeSrc, files.composeYml);
    onLine(`  ✓ compose.yml`);
  } else {
    onLine(`  ⚠ docker-compose.yml not found`);
  }

  // ── [6/7] metadata + restore scripts ─────────────────────────────────────
  onLine(`  [6/7] metadata + restore scripts...`);

  const bundleBase = {
    id:           tsSlug,
    instanceId:   instance.id,
    instanceSlug: instance.slug,
    createdAt:    now.toISOString(),
    bundlePath,
  };

  const metadata = {
    ...bundleBase,
    instanceName:     instance.name,
    dbContainer:      db,
    storageContainer: storage,
    ports:            instance.ports,
    studioUrl:        instance.studioUrl,
    snapshotFiles:    Object.keys(files),
    restoreGuide: [
      "1. Copy bundle to target machine",
      "2. Fill in env.redacted → .env (replace <REDACTED> with real secrets)",
      "3. Run restore.sh (Linux/macOS) or restore.ps1 (Windows)",
    ],
  };

  await fs.writeFile(files.metadata, JSON.stringify(metadata, null, 2), "utf-8");
  await fs.writeFile(files.restoreSh,  generateRestoreSh(bundleBase, instance, db),  "utf-8");
  await fs.writeFile(files.restorePs1, generateRestorePs1(bundleBase, instance, db), "utf-8");
  try { await fs.chmod(files.restoreSh, 0o755); } catch { /* Windows — ignore */ }
  onLine(`  ✓ metadata.json  restore.sh  restore.ps1`);

  // ── [7/7] Compress bundle ─────────────────────────────────────────────────
  onLine(`  [7/7] Compressing bundle...`);
  const archivePath = await packBundle(bundlePath);
  if (archivePath) {
    const archStat = await fs.stat(archivePath);
    onLine(`  ✓ ${tsSlug}.tar.gz  (${(archStat.size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    onLine(`  ⚠ Compression failed — raw bundle still available`);
  }

  const bundle: SnapshotBundle = {
    ...bundleBase,
    archivePath: archivePath ?? undefined,
    files,
  };

  await updateInstanceStatus(instance.id, {
    snapshotState: "complete",
    lastSnapshot:  now.toISOString(),
  });

  onLine(`✓ Snapshot complete  →  ${bundlePath}`);
  return bundle;
}

// ── listSnapshots ─────────────────────────────────────────────────────────────

/** List all snapshot bundles for a given RuntimeInstance, newest first. */
export async function listSnapshots(instance: RuntimeInstance): Promise<SnapshotBundle[]> {
  const instanceBackupsDir = join(BACKUPS_DIR, instance.slug);
  if (!existsSync(instanceBackupsDir)) return [];

  const entries = await fs.readdir(instanceBackupsDir, { withFileTypes: true });
  const bundles: SnapshotBundle[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = join(instanceBackupsDir, entry.name, "metadata.json");
    if (!existsSync(metaPath)) continue;
    try {
      const raw  = await fs.readFile(metaPath, "utf-8");
      const b    = JSON.parse(raw) as SnapshotBundle;
      // Attach archive path if it exists alongside the bundle directory
      const arch = join(instanceBackupsDir, `${entry.name}.tar.gz`);
      if (existsSync(arch)) b.archivePath = arch;
      bundles.push(b);
    } catch { /* corrupt metadata — skip */ }
  }

  return bundles.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── listOrphanSnapshots ───────────────────────────────────────────────────────

/**
 * List snapshot bundles for instances that are no longer in the registry
 * (i.e., deleted instances whose backups still exist on disk).
 *
 * @param knownSlugs  Slugs already covered by registered instances — these are
 *                    excluded so we don't double-count.
 */
export async function listOrphanSnapshots(
  knownSlugs: string[],
): Promise<Array<SnapshotBundle & { instanceName: string }>> {
  if (!existsSync(BACKUPS_DIR)) return [];

  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(BACKUPS_DIR, { withFileTypes: true });
  } catch { return []; }

  const result: Array<SnapshotBundle & { instanceName: string }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "templates") continue;
    if (knownSlugs.includes(entry.name)) continue;  // already in registry

    const slugDir = join(BACKUPS_DIR, entry.name);
    let snapEntries: import("fs").Dirent[];
    try {
      snapEntries = await fs.readdir(slugDir, { withFileTypes: true });
    } catch { continue; }

    for (const snap of snapEntries) {
      if (!snap.isDirectory()) continue;
      const metaPath = join(slugDir, snap.name, "metadata.json");
      if (!existsSync(metaPath)) continue;
      try {
        const raw  = await fs.readFile(metaPath, "utf-8");
        const b    = JSON.parse(raw) as SnapshotBundle & { instanceName?: string };
        const arch = join(slugDir, `${snap.name}.tar.gz`);
        if (existsSync(arch)) b.archivePath = arch;
        result.push({ ...b, instanceName: b.instanceName ?? entry.name });
      } catch { /* corrupt metadata — skip */ }
    }
  }

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── restoreInstance ───────────────────────────────────────────────────────────

/**
 * Restore a RuntimeInstance from a snapshot bundle directory.
 *
 * Steps:
 *   1. Verify bundle integrity
 *   2. Stop the full stack
 *   3. Bring up only the DB service and wait for it to be ready
 *   4. Stream db.dump → pg_restore
 *   5. Restore storage objects
 *   6. Restart full stack
 */
export async function restoreInstance(
  bundlePath:     string,
  onLine:         OnLine,
  targetInstance?: RuntimeInstance,   // when cloning into a NEW instance; omit for same-instance restore
): Promise<number> {
  const metaPath = join(bundlePath, "metadata.json");
  const dumpPath = join(bundlePath, "db.dump");

  if (!existsSync(metaPath) || !existsSync(dumpPath)) {
    onLine(`✗ Missing bundle files in ${bundlePath}`);
    return 1;
  }

  const meta = JSON.parse(await fs.readFile(metaPath, "utf-8")) as any;

  // Resolve instance:
  //  • If targetInstance is provided (clone flow) — use it directly.
  //  • Otherwise look up by instanceId in the registry (same-instance restore).
  //  • Fall back to core defaults if not found.
  let instance: Partial<RuntimeInstance> & { slug: string; dockerPath: string };
  if (targetInstance) {
    instance = targetInstance;
  } else {
    const { loadRegistry } = await import("./supabase-factory.ts");
    const registry = await loadRegistry();
    instance = registry.find((i) => i.id === meta.instanceId) ?? {
      id:         "core",
      slug:       "unenter",       // compose project name for core
      dockerPath: PROJECT_DIR,
    };
  }

  const projectName = instance.slug;

  // Container names:
  //  • Clone flow: derive from TARGET instance naming (slug-based).
  //  • Restore flow: use names saved in bundle metadata (may differ if containerPrefix was set).
  const prefix = (instance as RuntimeInstance).containerPrefix;
  const dbCont: string = targetInstance
    ? (prefix ? `${prefix}db` : `${projectName}-db`)
    : (meta.dbContainer ?? `${projectName}-db`);
  const storageCont: string = targetInstance
    ? (prefix ? `${prefix}storage` : `${projectName}-storage`)
    : (meta.storageContainer ?? `${projectName}-storage`);
  const storagePath = join(bundlePath, "storage");

  onLine(`↺ Restoring  ${meta.instanceName || projectName}  from snapshot…`);
  onLine(`  Bundle: ${meta.id}  (${new Date(meta.createdAt).toLocaleString()})`);

  // ── [1/5] Stop full stack ────────────────────────────────────────────────
  onLine(`\n[1/5] Stopping stack…`);
  await spawnRun(
    "docker",
    ["compose", "--project-name", projectName, "down", "--remove-orphans"],
    { cwd: instance.dockerPath },
  );

  // ── [2/5] Start DB only ──────────────────────────────────────────────────
  onLine(`[2/5] Starting database for recovery…`);
  await spawnRun(
    "docker",
    ["compose", "--project-name", projectName, "up", "-d", "db"],
    { cwd: instance.dockerPath, env: envWithFile(`${instance.dockerPath}/.env`) },
  );

  // Wait up to 30s for Postgres to accept connections
  let ready = false;
  for (let i = 0; i < 15; i++) {
    const { out } = await dockerExec(["exec", dbCont, "pg_isready", "-U", "postgres"]);
    if (out.includes("accepting connections")) { ready = true; break; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ready) {
    onLine(`✗ Postgres failed to become ready`);
    return 1;
  }
  onLine(`  ✓ Postgres ready`);

  // ── [3/5] Restore database ────────────────────────────────────────────────
  onLine(`\n[3/5] Restoring database…`);
  await dockerExec(["exec", dbCont, "mkdir", "-p", "/restore"]);

  const restoreProc = spawn("docker", [
    "exec", "-i", dbCont,
    "pg_restore",
    "-U", "postgres",
    "-d", "postgres",
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
  ], { stdio: ["pipe", "pipe", "pipe"] });

  createReadStream(dumpPath).pipe(restoreProc.stdin);

  const dbExitCode = await new Promise<number>((resolve) => {
    restoreProc.stderr.on("data", (d: Buffer) => {
      const line = d.toString().trim();
      if (line) onLine(`  pg: ${line}`);
    });
    restoreProc.on("close", resolve);
  });

  if (dbExitCode !== 0) {
    onLine(`  ⚠ pg_restore exit ${dbExitCode} — verify data above`);
  } else {
    onLine(`  ✓ database restored`);
  }

  // ── [4/5] Restore storage objects ────────────────────────────────────────
  onLine(`\n[4/5] Restoring storage objects…`);
  if (existsSync(storagePath)) {
    // Start storage container if not running
    await spawnRun(
      "docker",
      ["compose", "--project-name", projectName, "up", "-d", "storage"],
      { cwd: instance.dockerPath, env: envWithFile(`${instance.dockerPath}/.env`) },
    );
    await new Promise((r) => setTimeout(r, 3000)); // brief wait for container init

    const { code: stgCode, out: stgOut } = await dockerExec([
      "cp", `${storagePath}/.`, `${storageCont}:/var/lib/storage/`,
    ]);
    if (stgCode !== 0) {
      onLine(`  ⚠ Storage restore exit ${stgCode}: ${stgOut}`);
    } else {
      onLine(`  ✓ storage objects restored`);
    }
  } else {
    onLine(`  ⚠ No storage/ directory in bundle — skipping`);
  }

  // ── [5/5] Restart full stack ──────────────────────────────────────────────
  onLine(`\n[5/5] Restarting full stack…`);
  await spawnRun(
    "docker",
    ["compose", "--project-name", projectName, "up", "-d", "--remove-orphans"],
    { cwd: instance.dockerPath, env: envWithFile(`${instance.dockerPath}/.env`) },
  );

  onLine(`\n✓ Restore complete!`);
  return 0;
}

// ── cloneFromBundle ───────────────────────────────────────────────────────────

/**
 * Deploy a snapshot bundle as a brand-new independent instance.
 *
 * This is the "seed" flow: take any snapshot, give it a new slug, and spin up
 * a completely independent Supabase stack pre-loaded with that data.
 *
 * Steps:
 *   1. Read and validate the source bundle
 *   2. Create the target project directory
 *   3. Copy compose.yml with substituted project name + ports
 *   4. Start the new stack
 *   5. Restore database from bundle's db.dump
 *   6. Restore storage objects
 *   7. Register new instance in zone registry
 *
 * Callers are responsible for assigning non-conflicting ports via CloneConfig.
 * The zone wizard will handle port discovery; this function just executes.
 */
export async function cloneFromBundle(
  bundlePath: string,
  newSlug:    string,
  cfg:        CloneConfig,
  onLine:     OnLine,
): Promise<CloneResult> {
  const metaPath = join(bundlePath, "metadata.json");
  const dumpPath = join(bundlePath, "db.dump");

  if (!existsSync(metaPath) || !existsSync(dumpPath)) {
    throw new Error(`Invalid bundle — missing files in ${bundlePath}`);
  }

  const meta        = JSON.parse(await fs.readFile(metaPath, "utf-8")) as any;
  const projectName = cfg.projectName ?? newSlug;
  const dbCont      = `${projectName}-db`;
  const storageCont = `${projectName}-storage`;
  const storagePath = join(bundlePath, "storage");

  onLine(`🌱 Cloning  ${meta.instanceName ?? meta.instanceSlug}  →  ${newSlug}`);
  onLine(`   Source bundle: ${meta.id}  (${new Date(meta.createdAt).toLocaleString()})`);

  // ── [1/6] Set up target directory ────────────────────────────────────────
  onLine(`\n[1/6] Setting up target directory…`);
  await fs.mkdir(cfg.targetDir, { recursive: true });

  // Copy and adapt compose.yml
  const composeSrc = join(bundlePath, "compose.yml");
  if (!existsSync(composeSrc)) throw new Error("Bundle missing compose.yml");

  let composeContent = await fs.readFile(composeSrc, "utf-8");
  // Substitute port bindings in compose file
  // These patterns match common Supabase compose port formats
  composeContent = composeContent
    .replace(/:\d+:5432/g, `:${cfg.ports.postgres}:5432`)
    .replace(/:\d+:3000/g, `:${cfg.ports.studio}:3000`)
    .replace(/:\d+:8000/g, `:${cfg.ports.kong}:8000`)
    .replace(/:\d+:8443/g, `:${cfg.ports.kongSSL}:8443`);

  await fs.writeFile(join(cfg.targetDir, "docker-compose.yml"), composeContent, "utf-8");

  // Copy env.redacted as a starting point — caller must fill in secrets
  const envSrc = join(bundlePath, "env.redacted");
  if (existsSync(envSrc)) {
    await fs.copyFile(envSrc, join(cfg.targetDir, ".env.example"));
    onLine(`  ✓ .env.example written (fill in <REDACTED> values)`);
  }

  onLine(`  ✓ target directory ready: ${cfg.targetDir}`);

  // ── [2/6] Start new stack ────────────────────────────────────────────────
  onLine(`\n[2/6] Starting new stack (${projectName})…`);
  const { code: upCode, out: upOut } = await spawnRun(
    "docker",
    ["compose", "--project-name", projectName, "up", "-d", "--remove-orphans"],
    { cwd: cfg.targetDir },
  );
  if (upCode !== 0) {
    throw new Error(`docker compose up failed:\n${upOut}`);
  }

  // Wait for Postgres
  onLine(`  Waiting for Postgres…`);
  let ready = false;
  for (let i = 0; i < 15; i++) {
    const { out } = await dockerExec(["exec", dbCont, "pg_isready", "-U", "postgres"]);
    if (out.includes("accepting connections")) { ready = true; break; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ready) throw new Error("New instance Postgres failed to start");
  onLine(`  ✓ Postgres ready`);

  // ── [3/6] Restore database ─────────────────────────────────────────────
  onLine(`\n[3/6] Loading database from bundle…`);
  await dockerExec(["exec", dbCont, "mkdir", "-p", "/restore"]);

  const restoreProc = spawn("docker", [
    "exec", "-i", dbCont,
    "pg_restore",
    "-U", "postgres",
    "-d", "postgres",
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
  ], { stdio: ["pipe", "pipe", "pipe"] });

  createReadStream(dumpPath).pipe(restoreProc.stdin);

  const dbExitCode = await new Promise<number>((resolve) => {
    restoreProc.stderr.on("data", (d: Buffer) => {
      const line = d.toString().trim();
      if (line) onLine(`  pg: ${line}`);
    });
    restoreProc.on("close", resolve);
  });

  if (dbExitCode !== 0) {
    onLine(`  ⚠ pg_restore exit ${dbExitCode} — check output above`);
  } else {
    onLine(`  ✓ database loaded`);
  }

  // ── [4/6] Restore storage ──────────────────────────────────────────────
  onLine(`\n[4/6] Restoring storage objects…`);
  if (existsSync(storagePath)) {
    const { code: stgCode } = await dockerExec([
      "cp", `${storagePath}/.`, `${storageCont}:/var/lib/storage/`,
    ]);
    onLine(stgCode === 0 ? `  ✓ storage objects loaded` : `  ⚠ storage copy failed`);
  } else {
    onLine(`  (no storage objects in bundle)`);
  }

  // ── [5/6] Write bundle manifest into clone ─────────────────────────────
  onLine(`\n[5/6] Writing clone manifest…`);
  const cloneMeta = {
    cloneSlug:      newSlug,
    projectName,
    clonedFrom:     meta.id,
    sourceSlug:     meta.instanceSlug,
    sourceName:     meta.instanceName,
    clonedAt:       new Date().toISOString(),
    ports:          cfg.ports,
    studioUrl:      `http://127.0.0.1:${cfg.ports.studio}`,
    note:           "Fill in .env.example → .env before exposing publicly",
  };
  await fs.writeFile(
    join(cfg.targetDir, "clone-manifest.json"),
    JSON.stringify(cloneMeta, null, 2),
    "utf-8",
  );
  onLine(`  ✓ clone-manifest.json`);

  // ── [6/6] Register in zone registry ───────────────────────────────────
  onLine(`\n[6/6] Registering clone in zone registry…`);
  // TODO: wire into zone registry once the registry write API is finalized.
  // For now, the TUI zone wizard handles registration after this function returns.
  onLine(`  (registration handled by zone wizard)`);

  const studioUrl = `http://127.0.0.1:${cfg.ports.studio}`;
  onLine(`\n✓ Clone ready!`);
  onLine(`  Studio:  ${studioUrl}`);
  onLine(`  ⚠  Fill in ${cfg.targetDir}/.env.example → .env before going live`);

  return { slug: newSlug, bundlePath: cfg.targetDir, studioUrl };
}

// ── listTemplates ─────────────────────────────────────────────────────────────

/**
 * Return all captured fresh-template bundles, newest first.
 * Templates live at:  backups/supabase-core/templates/fresh-{date}.tar.gz
 */
export async function listTemplates(): Promise<TemplateBundle[]> {
  if (!existsSync(TEMPLATES_DIR)) return [];

  const entries = await fs.readdir(TEMPLATES_DIR);
  const bundles: TemplateBundle[] = [];

  for (const name of entries) {
    if (!name.startsWith("fresh-") || !name.endsWith(".tar.gz")) continue;
    const version     = name.replace(/^fresh-/, "").replace(/\.tar\.gz$/, "");
    const archivePath = join(TEMPLATES_DIR, name);
    const bundlePath  = join(TEMPLATES_DIR, version);

    // Approximate createdAt from filename (good enough for age checks)
    const createdAt = `${version.slice(0, 10)}T00:00:00.000Z`;

    try {
      // Prefer reading the actual timestamp from metadata if bundle dir exists
      const metaPath = join(bundlePath, "metadata.json");
      if (existsSync(metaPath)) {
        const meta = JSON.parse(await fs.readFile(metaPath, "utf-8")) as { createdAt?: string };
        bundles.push({ version, createdAt: meta.createdAt ?? createdAt, archivePath, bundlePath });
      } else {
        bundles.push({ version, createdAt, archivePath, bundlePath });
      }
    } catch {
      bundles.push({ version, createdAt, archivePath, bundlePath });
    }
  }

  return bundles.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── captureTemplate ───────────────────────────────────────────────────────────

/**
 * Capture a fresh vanilla Supabase snapshot as a reusable seed template.
 *
 * This spins up a temporary Supabase instance with no user data, waits for
 * all services to be ready (Kong health + Studio home), snapshots immediately,
 * tears the stack down, and archives the result at:
 *
 *   backups/supabase-core/templates/fresh-{date}.tar.gz
 *
 * If a template already exists and is ≤ maxAgeDays old, it is returned
 * immediately without spinning up a new instance — this function is safe to
 * call on every boot.
 *
 * Steps:
 *   1. Check for an existing fresh-enough template
 *   2. createRuntimeInstance("template-seed")
 *   3. docker compose up -d
 *   4. Poll Kong (/health) + Studio (/) until both respond 200
 *   6. snapshotInstance() → writes bundle + .tar.gz
 *   7. Copy archive → TEMPLATES_DIR/fresh-{date}.tar.gz
 *   8. docker compose down + deregister temp instance
 *
 * @param maxAgeDays  Reuse existing template if ≤ this many days old (default 30).
 *                    Pass 0 to always capture a fresh one.
 */
export async function captureTemplate(
  onLine:      OnLine,
  maxAgeDays = 30,
): Promise<TemplateBundle> {
  // ── [0] Check for a reusable existing template ────────────────────────────
  const existing = await listTemplates();
  if (maxAgeDays > 0 && existing.length > 0) {
    const latest    = existing[0];
    const ageDays   = (Date.now() - new Date(latest.createdAt).getTime()) / 86_400_000;
    if (ageDays <= maxAgeDays) {
      onLine(`✓ Reusing template  ${latest.version}  (${ageDays.toFixed(0)}d old, ≤ ${maxAgeDays}d)`);
      return latest;
    }
    onLine(`• Existing template is ${ageDays.toFixed(0)}d old — capturing a fresh one`);
  }

  onLine("🌱 Capturing fresh template — spinning up vanilla Supabase...");

  // ── [1] Create a temporary instance ─────────────────────────────────────
  onLine("\n[1/5] Creating temporary seed instance...");
  const instance = await createRuntimeInstance("template-seed", onLine);
  onLine(`  ✓ instance: ${instance.slug}  Kong:${instance.ports.kong}  Studio:${instance.ports.studio}`);

  let captureError: Error | null = null;
  let bundle: SnapshotBundle | null = null;

  try {
    // ── [3] Start the stack ────────────────────────────────────────────────
    onLine("\n[2/5] Starting stack...");
    const { code: upCode, out: upOut } = await spawnRun(
      "docker",
      ["compose", "--project-name", instance.slug, "up", "-d", "--remove-orphans"],
      { cwd: instance.dockerPath, timeout: 120_000,
        env: envWithFile(`${instance.dockerPath}/.env`) },
    );
    if (upCode !== 0) throw new Error(`docker compose up failed:\n${upOut}`);
    onLine("  ✓ containers starting");

    // ── [4] Wait for Kong + Studio to be healthy ───────────────────────────
    onLine("\n[3/5] Waiting for services (up to 4 min — migrations run on first boot)...");

    const kongUrl   = `http://127.0.0.1:${instance.ports.kong}/health`;
    const studioUrl = `http://127.0.0.1:${instance.ports.studio}/`;
    const MAX_POLLS = 120;  // 120 × 2s = 4 min
    let kongOk    = false;
    let studioOk  = false;

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, 2000));

      if (!kongOk) {
        try {
          const res = await fetch(kongUrl, { signal: AbortSignal.timeout(2000) });
          if (res.status < 500) {
            kongOk = true;
            onLine(`  ✓ Kong health  (poll ${i + 1})`);
          }
        } catch { /* not ready yet */ }
      }

      if (!studioOk) {
        try {
          const res = await fetch(studioUrl, { signal: AbortSignal.timeout(2000) });
          if (res.status < 500) {
            studioOk = true;
            onLine(`  ✓ Studio ready  (poll ${i + 1})`);
          }
        } catch { /* not ready yet */ }
      }

      if (kongOk && studioOk) break;

      if ((i + 1) % 15 === 0) {
        onLine(`  … still waiting  (${(i + 1) * 2}s elapsed, Kong:${kongOk ? "✓" : "⏳"}  Studio:${studioOk ? "✓" : "⏳"})`);
      }
    }

    if (!kongOk || !studioOk) {
      throw new Error(`Services did not become ready in time (Kong:${kongOk}  Studio:${studioOk})`);
    }

    // Brief extra settle — let any background migrations complete
    onLine("  ⏳ 10s settle pause...");
    await new Promise((r) => setTimeout(r, 10_000));

    // ── [5] Snapshot the vanilla instance ─────────────────────────────────
    onLine("\n[4/5] Snapshotting vanilla instance...");
    bundle = await snapshotInstance(instance, onLine);

  } catch (err) {
    captureError = err instanceof Error ? err : new Error(String(err));
    onLine(`✗ Template capture failed: ${captureError.message}`);
  } finally {
    // ── Always: stop stack + deregister temp instance ────────────────────
    onLine("\n[5/5] Tearing down temporary instance...");
    await spawnRun(
      "docker",
      ["compose", "--project-name", instance.slug, "down", "--remove-orphans", "-v"],
      { cwd: instance.dockerPath, timeout: 60_000 },
    ).catch(() => { /* best-effort */ });
    await removeFromRegistry(instance.id).catch(() => { /* best-effort */ });
    onLine("  ✓ temporary instance stopped + deregistered");
  }

  if (captureError || !bundle) throw captureError ?? new Error("snapshot returned null");

  // ── Move archive into templates/ ──────────────────────────────────────────
  if (!bundle.archivePath) throw new Error("Snapshot produced no .tar.gz archive");

  await fs.mkdir(TEMPLATES_DIR, { recursive: true });

  const today       = new Date().toISOString().slice(0, 10);  // "2026-05-25"
  const destName    = `fresh-${today}.tar.gz`;
  const destPath    = join(TEMPLATES_DIR, destName);

  await fs.copyFile(bundle.archivePath, destPath);
  onLine(`\n✓ Template archive →  ${destPath}`);

  const archStat = await fs.stat(destPath);
  onLine(`  Size: ${(archStat.size / 1024 / 1024).toFixed(1)} MB`);

  return {
    version:     today,
    createdAt:   new Date().toISOString(),
    archivePath: destPath,
    bundlePath:  join(TEMPLATES_DIR, today),   // raw dir (doesn't exist — archive only)
  };
}
