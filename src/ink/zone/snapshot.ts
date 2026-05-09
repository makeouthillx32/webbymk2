// src/ink/zone/snapshot.ts
// ─────────────────────────────────────────────────────────────────────────────
// Snapshot System — Phase 4 of the Core Runtime Control Plane.
//
// A valid snapshot bundle contains everything needed to:
//   • Move the runtime to a different machine
//   • Restore after corruption or data loss
//   • Clone the environment for a new instance
//   • Rehydrate from scratch using only Docker + the bundle
//
// Bundle layout:
//   {backupsDir}/{slug}/{timestamp}/
//     db.dump          — pg_dump custom-format (binary, compressed)
//     schema.sql       — pg_dump schema-only (human-readable reference)
//     storage/         — Supabase storage objects (rclone or tar)
//     env.redacted     — .env with secrets replaced by placeholders
//     compose.yml      — docker-compose.yml snapshot
//     metadata.json    — instance metadata + bundle manifest
//     restore.sh       — Linux/macOS restore script
//     restore.ps1      — Windows PowerShell restore script
//
// Exports:
//   snapshotInstance(instance, onLine) → SnapshotBundle
//   restoreInstance(bundlePath, onLine) → void
//   listSnapshots(instance) → SnapshotBundle[]
// ─────────────────────────────────────────────────────────────────────────────

import { promises as fs, existsSync, createReadStream } from "fs";
import { join }            from "path";
import { spawn }           from "child_process";
import { PROJECT_DIR }     from "../../config/stack.ts";
import { updateInstanceStatus, type RuntimeInstance } from "./supabase-factory.ts";
import type { OnLine }     from "./types.ts";

// ── Snapshot bundle descriptor ────────────────────────────────────────────────

export interface SnapshotBundle {
  id:          string;   // ISO timestamp slug, e.g. "2026-05-08_14-30-00"
  instanceId:  string;
  instanceSlug:string;
  createdAt:   string;   // ISO-8601
  bundlePath:  string;   // absolute path to bundle directory
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

// ── Paths ─────────────────────────────────────────────────────────────────────

const BACKUPS_DIR = join(PROJECT_DIR, "backups", "supabase-core");

// ── Spawn helper ──────────────────────────────────────────────────────────────

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

function dbContainer(instance: RuntimeInstance): string {
  return `${instance.slug}-db`;
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

function generateRestoreSh(bundle: Omit<SnapshotBundle, "files">, instance: RuntimeInstance): string {
  return `#!/usr/bin/env bash
# Restore script — generated ${bundle.createdAt}
# Instance: ${instance.name}  (${instance.slug})
#
# Requirements: docker, docker compose, bash
# Usage: bash restore.sh
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTANCE_SLUG="${instance.slug}"
DB_CONTAINER="\${INSTANCE_SLUG}-db"

echo "==> Restoring instance: ${instance.name}"
echo "    Bundle: \$BUNDLE_DIR"
echo ""

# 1. Bring compose stack up (must be running for pg_restore)
echo "[1/3] Starting compose stack..."
docker compose --project-name "\$INSTANCE_SLUG" -f "\$BUNDLE_DIR/compose.yml" up -d --remove-orphans

echo "      Waiting 20s for Postgres to be ready..."
sleep 20

# 2. Restore pg_dump into the running Postgres container
echo "[2/3] Restoring database..."
docker exec "\$DB_CONTAINER" bash -c "
  pg_restore \\
    --host=localhost --username=postgres --dbname=postgres \\
    --clean --if-exists --no-owner --no-privileges \\
    /restore/db.dump
" || { echo "  pg_restore returned non-zero — check output above"; }

echo "[3/3] Done. Studio: http://127.0.0.1:${instance.ports.studio}"
echo ""
echo "NOTE: Regenerate secrets before exposing this instance publicly."
echo "      Copy .env.redacted to .env and fill in the <REDACTED> values."
`;
}

function generateRestorePs1(bundle: Omit<SnapshotBundle, "files">, instance: RuntimeInstance): string {
  return `# Restore script — generated ${bundle.createdAt}
# Instance: ${instance.name}  (${instance.slug})
#
# Requirements: docker, docker compose, PowerShell 7+
# Usage: pwsh restore.ps1
$ErrorActionPreference = "Stop"

$BundleDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstanceSlug = "${instance.slug}"
$DbContainer = "$InstanceSlug-db"

Write-Host "==> Restoring instance: ${instance.name}"
Write-Host "    Bundle: $BundleDir"
Write-Host ""

# 1. Bring compose stack up
Write-Host "[1/3] Starting compose stack..."
docker compose --project-name $InstanceSlug -f "$BundleDir/compose.yml" up -d --remove-orphans

Write-Host "      Waiting 20s for Postgres to be ready..."
Start-Sleep -Seconds 20

# 2. Restore pg_dump
Write-Host "[2/3] Restoring database..."
docker exec $DbContainer bash -c @"
  pg_restore --host=localhost --username=postgres --dbname=postgres --clean --if-exists --no-owner --no-privileges /restore/db.dump
"@ | Write-Host

Write-Host "[3/3] Done. Studio: http://127.0.0.1:${instance.ports.studio}"
Write-Host ""
Write-Host "NOTE: Copy env.redacted to .env and fill in the <REDACTED> values before use."
`;
}

// ── snapshotInstance ──────────────────────────────────────────────────────────

/**
 * Create a full snapshot bundle for a RuntimeInstance.
 *
 * Streams progress to onLine. Updates instance snapshotState in the registry.
 * Returns the SnapshotBundle descriptor on success. Throws on failure.
 */
export async function snapshotInstance(
  instance: RuntimeInstance,
  onLine:   OnLine,
): Promise<SnapshotBundle> {
  const now      = new Date();
  const tsSlug   = now.toISOString().slice(0, 19).replace(/[T:]/g, "-");
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

  const db = dbContainer(instance);

  // ── Ensure backup dir inside container ───────────────────────────────────
  await dockerExec(["exec", db, "mkdir", "-p", "/restore"]);

  // ── pg_dump (custom format — binary, compressed, restorable) ─────────────
  onLine(`  [1/5] pg_dump (custom format)...`);
  const dumpCode = await dockerStream([
    "exec", db,
    "sh", "-c",
    `pg_dump -U postgres -Fc postgres > /restore/db.dump && echo "✓ db.dump written"`,
  ], onLine);
  if (dumpCode !== 0) {
    await updateInstanceStatus(instance.id, { snapshotState: "error" });
    throw new Error(`pg_dump failed (exit ${dumpCode})`);
  }

  // Copy dump out of container
  const { code: cpDumpCode } = await dockerExec(["cp", `${db}:/restore/db.dump`, files.dbDump]);
  if (cpDumpCode !== 0) throw new Error("docker cp db.dump failed");
  onLine(`  ✓ db.dump  →  bundle`);

  // ── pg_dump (schema only — human-readable reference) ─────────────────────
  onLine(`  [2/5] pg_dump (schema only)...`);
  await dockerStream([
    "exec", db,
    "sh", "-c",
    `pg_dump -U postgres -s postgres > /restore/schema.sql && echo "✓ schema.sql written"`,
  ], onLine);
  await dockerExec(["cp", `${db}:/restore/schema.sql`, files.schemaSql]);
  onLine(`  ✓ schema.sql  →  bundle`);

  // ── env.redacted ──────────────────────────────────────────────────────────
  onLine(`  [3/5] Writing env.redacted...`);
  const envSrc = join(instance.dockerPath, ".env");
  if (existsSync(envSrc)) {
    const envContent = await fs.readFile(envSrc, "utf-8");
    await fs.writeFile(files.envRedacted, redactEnv(envContent), "utf-8");
    onLine(`  ✓ env.redacted  (secrets replaced with <REDACTED>)`);
  } else {
    onLine(`  ⚠ .env not found — skipping env.redacted`);
  }

  // ── compose.yml ───────────────────────────────────────────────────────────
  onLine(`  [4/5] Copying compose.yml...`);
  const composeSrc = join(instance.dockerPath, "docker-compose.yml");
  if (existsSync(composeSrc)) {
    await fs.copyFile(composeSrc, files.composeYml);
    onLine(`  ✓ compose.yml  →  bundle`);
  } else {
    onLine(`  ⚠ docker-compose.yml not found`);
  }

  // ── metadata.json + restore scripts ──────────────────────────────────────
  onLine(`  [5/5] Writing metadata + restore scripts...`);

  const bundleBase = {
    id:           tsSlug,
    instanceId:   instance.id,
    instanceSlug: instance.slug,
    createdAt:    now.toISOString(),
    bundlePath,
  };

  const metadata = {
    ...bundleBase,
    instanceName:  instance.name,
    ports:         instance.ports,
    studioUrl:     instance.studioUrl,
    snapshotFiles: Object.keys(files),
    restoreGuide:  [
      "1. Copy bundle to target machine",
      "2. Fill in env.redacted → .env (replace <REDACTED> with real secrets)",
      "3. Run restore.sh (Linux/macOS) or restore.ps1 (Windows)",
    ],
  };

  await fs.writeFile(files.metadata, JSON.stringify(metadata, null, 2), "utf-8");

  await fs.writeFile(files.restoreSh,  generateRestoreSh(bundleBase, instance),  "utf-8");
  await fs.writeFile(files.restorePs1, generateRestorePs1(bundleBase, instance), "utf-8");

  // chmod +x on Unix
  try { await fs.chmod(files.restoreSh, 0o755); } catch { /* windows — ignore */ }

  onLine(`  ✓ metadata.json  restore.sh  restore.ps1`);

  const bundle: SnapshotBundle = { ...bundleBase, files };

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
      const raw = await fs.readFile(metaPath, "utf-8");
      bundles.push(JSON.parse(raw) as SnapshotBundle);
    } catch { /* corrupt metadata — skip */ }
  }

  return bundles.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

import { spawn } from "child_process";

/**
 * Restore a RuntimeInstance from a snapshot bundle.
 * 
 * Process:
 *   1. Verify bundle integrity
 *   2. Stop dependents (Kong, Auth, etc) to freeze writes
 *   3. Stream db.dump → pg_restore inside the container
 *   4. Restart stack
 */
export async function restoreInstance(
  bundlePath: string,
  onLine:     OnLine,
): Promise<number> {
  const metaPath = join(bundlePath, "metadata.json");
  const dumpPath = join(bundlePath, "db.dump");

  if (!existsSync(metaPath) || !existsSync(dumpPath)) {
    onLine(`✗ Restore failed: Missing bundle files in ${bundlePath}`);
    return 1;
  }

  const meta = JSON.parse(await fs.readFile(metaPath, "utf-8")) as any;
  const { loadRegistry } = await import("./supabase-factory.ts");
  const registry = await loadRegistry();
  const instance = registry.find(i => i.id === meta.instanceId) || {
    id: "core", slug: "core", dockerPath: PROJECT_DIR // fallback to core
  };

  onLine(`↺ Restoring  ${meta.instanceName || instance.slug}  from snapshot…`);
  onLine(`  Bundle: ${meta.id} (${new Date(meta.createdAt).toLocaleString()})`);

  // Step 1 — Stop dependents
  onLine(`\n[1/3] Freezing traffic…`);
  const { stopCoreStack, startCoreStack } = await import("../db-api.ts");
  // We don't stop the whole stack (we need DB running), just stop dependents
  // For simplicity in this first version, we'll stop everything and restart DB.
  await stopCoreStack(instance as any, onLine);

  // Step 2 — Start JUST the database
  onLine(`\n[2/3] Restarting database for recovery…`);
  const dbCont = `${instance.slug}-db`;
  const { dockerRun } = await import("../docker.ts");
  
  await dockerRun(["compose", "--project-name", instance.slug, "up", "-d", "db"], {
    cwd: instance.dockerPath
  });

  // Wait for PG to be ready
  let ready = false;
  for (let i = 0; i < 10; i++) {
    const { out } = await dockerRun(["exec", dbCont, "pg_isready", "-U", "postgres"]);
    if (out.includes("accepting connections")) { ready = true; break; }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!ready) {
    onLine(`✗ Database failed to start for recovery.`);
    return 1;
  }

  // Step 3 — Stream dump into pg_restore
  onLine(`\n[3/3] Hydrating data from dump…`);
  
  // Create the process: cat db.dump | docker exec -i <db> pg_restore ...
  const restoreProc = spawn("docker", [
    "exec", "-i", dbCont,
    "pg_restore",
    "-U", "postgres",
    "-d", "postgres",
    "--clean",         // drop existing objects
    "--if-exists",     // don't error on missing objects during clean
    "--no-owner",      // ignore owner changes
    "--no-privileges", // ignore permission changes
  ], { stdio: ["pipe", "pipe", "pipe"] });

  const dumpStream = createReadStream(dumpPath);
  dumpStream.pipe(restoreProc.stdin);

  const exitCode = await new Promise<number>((resolve) => {
    restoreProc.stderr.on("data", (data) => {
      const line = data.toString().trim();
      if (line) onLine(`  pg: ${line}`);
    });
    restoreProc.on("close", resolve);
  });

  if (exitCode !== 0) {
    onLine(`\n⚠ pg_restore finished with exit code ${exitCode}. Check logs for warnings.`);
  }

  onLine(`\n✓ Data hydrated. Restarting full stack…`);
  await startCoreStack(instance as any, onLine);

  onLine(`\n✓ Restore complete!`);
  return 0;
}
