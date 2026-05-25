#!/usr/bin/env bun
// scripts/do-backup.ts
// ─────────────────────────────────────────────────────────────────────────────
// One-shot comprehensive backup for the core Supabase stack.
//
// Run from the project root:
//   bun run scripts/do-backup.ts
//
// What it captures:
//   [1/6] db.dump          — pg_dump custom format (restorable)
//   [2/6] schema.sql       — schema-only dump (human-readable reference)
//   [3/6] storage/         — all Supabase storage objects (docker cp)
//   [4/6] env.redacted     — .env with secrets replaced by <REDACTED>
//   [5/6] compose.yml      — docker-compose.yml snapshot
//   [6/6] metadata.json    — bundle manifest + restore scripts
//
// Bundle lands at:  <project>/backups/supabase-core/unenter/<timestamp>/
// ─────────────────────────────────────────────────────────────────────────────

import { snapshotInstance } from "../src/ink/zone/snapshot.ts";
import type { RuntimeInstance } from "../src/ink/zone/supabase-factory.ts";
import { PROJECT_DIR } from "../src/config/stack.ts";

const CORE: RuntimeInstance = {
  id:              "core",
  name:            "Core Supabase",
  slug:            "unenter",
  containerPrefix: "unt_",      // containers: unt_db, unt_storage, …
  status:          "active",
  createdAt:       "",
  runtimePath:     PROJECT_DIR,
  dockerPath:      PROJECT_DIR,
  ports:           { kong: 8001, kongSSL: 8443, postgres: 5432, pooler: 0, analytics: 0, studio: 3002 },
  secrets:         { postgresPassword: "", jwtSecret: "", anonKey: "", serviceRoleKey: "", dashboardPassword: "" },
  studioUrl:       "",
  healthState:     "unknown",
  snapshotState:   "none",
};

console.log("═══════════════════════════════════════════════════════════════");
console.log("  UNAXIS Comprehensive Backup");
console.log("═══════════════════════════════════════════════════════════════");
console.log("");

try {
  const bundle = await snapshotInstance(CORE, (line) => console.log(line));

  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Bundle complete");
  console.log(`  Path: ${bundle.bundlePath}`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  // List bundle contents
  const { readdirSync, statSync } = await import("fs");
  const { join } = await import("path");

  function humanSize(bytes: number): string {
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }

  function listDir(dir: string, prefix = ""): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const children = readdirSync(full, { withFileTypes: true });
        console.log(`${prefix}📁  ${entry.name}/  (${children.length} item${children.length !== 1 ? "s" : ""})`);
        listDir(full, prefix + "    ");
      } else {
        const size = humanSize(statSync(full).size);
        console.log(`${prefix}📄  ${entry.name.padEnd(22)}  ${size}`);
      }
    }
  }

  console.log("Bundle contents:");
  console.log("");
  listDir(bundle.bundlePath);
  console.log("");

} catch (err: any) {
  console.error("✗ Backup failed:", err?.message ?? err);
  process.exit(1);
}
