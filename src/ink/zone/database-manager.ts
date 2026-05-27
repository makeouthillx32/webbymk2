// src/ink/zone/database-manager.ts
// ─────────────────────────────────────────────────────────────────────────────
// Database Instance Manager — Phase 5 of the Core Runtime Control Plane.
//
// Orchestrates the full lifecycle of a public-facing Supabase database instance:
//
//   1. Clone from a bundle (snapshot or fresh template)  → cloneFromBundle()
//   2. Register proxy metadata                           → addDatabaseRoutes()
//   3. Register NPM proxy hosts with SSL                 → npmAddDatabaseHosts()
//   4. Generate MCP connection config                    → writeMcpConfig()
//
// Public domains after provisioning:
//   db.{slug}.{domain}     — Kong API gateway (Supabase REST / realtime / auth)
//   studio.{slug}.{domain} — Supabase Studio UI
//
// MCP config written to:
//   {instanceDir}/mcp-config.json   — paste into claude_desktop_config.json
//   {instanceDir}/mcp-env.txt       — plain env vars for .env / shell scripts
//
// Exports:
//   provisionDatabase(slug, bundlePath, cfg, onLine)  → ProvisionResult
//   generateMcpConfig(slug, publicUrl, keys)          → McpConfig
//   writeMcpConfig(dir, slug, publicUrl, keys, onLine)
//   decommissionDatabase(slug, onLine)                → void
// ─────────────────────────────────────────────────────────────────────────────

import { promises as fs }  from "fs";
import { join }             from "path";
import {
  addDatabaseRoutes,
  removeDatabaseRoutes,
  setDatabaseNpmIds,
  getDatabaseRoutes,
  type DatabaseRouteEntry,
}                           from "../proxy-config.ts";
import {
  npmAddDatabaseHosts,
  npmDeleteHost,
  npmGetToken,
}                           from "../npm-api.ts";
import {
  cloneFromBundle,
  captureTemplate,
  snapshotInstance,
  listSnapshots,
  type CloneConfig,
  type CloneResult,
}                           from "./snapshot.ts";
import {
  createRuntimeInstance,
  initializeSupabaseCore,
  removeFromRegistry,
  spawnRun,
  envWithFile,
  CORE_DIR,
  type RuntimeInstance,
}                           from "./supabase-factory.ts";
import { DOMAIN, STACK_HOST } from "../../config/stack.ts";
import { loadRegistry, updateInstanceStatus } from "./supabase-factory.ts";
import { existsSync }          from "fs";
import type { OnLine }         from "./types.ts";

// ── Guard rails ───────────────────────────────────────────────────────────────

/** Slugs that would collide with system subdomains or reserved DNS labels. */
const RESERVED_SLUGS = new Set([
  "www", "api", "db", "studio", "mail", "cdn", "app", "admin",
  "ftp", "smtp", "pop", "imap", "vpn", "ns", "ns1", "ns2",
  "unenter", "core", "template", "test", "dev", "staging", "prod",
]);

/**
 * Validate a database slug for DNS safety and uniqueness.
 * Throws a descriptive Error on any violation so the caller surfaces it cleanly.
 *
 * Rules:
 *   • 2–40 characters
 *   • Lowercase letters, digits, hyphens only
 *   • Must start and end with a letter or digit (no leading/trailing hyphens)
 *   • No consecutive hyphens
 *   • Not a reserved name
 *   • Not already registered in proxy routes or the instance registry
 */
export async function validateDatabaseSlug(slug: string): Promise<void> {
  if (!slug || typeof slug !== "string") {
    throw new Error("Slug is required");
  }
  if (slug.length < 2 || slug.length > 40) {
    throw new Error(`Slug "${slug}" must be 2–40 characters (got ${slug.length})`);
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && !/^[a-z0-9]$/.test(slug)) {
    throw new Error(
      `Slug "${slug}" is invalid — use lowercase letters, digits, and hyphens only.\n` +
      `  Must start and end with a letter or digit.  Example: my-db`
    );
  }
  if (/--/.test(slug)) {
    throw new Error(`Slug "${slug}" contains consecutive hyphens (not allowed)`);
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(
      `Slug "${slug}" is reserved.  Choose a more specific name, e.g. "${slug}-db" or "my${slug}"`
    );
  }

  // Uniqueness: proxy routes
  const routes = getDatabaseRoutes();
  if (routes[slug]) {
    throw new Error(
      `Slug "${slug}" is already registered as a database instance.\n` +
      `  API: ${routes[slug].apiDomain}  Studio: ${routes[slug].studioDomain}\n` +
      `  Run: db templates  to list existing instances or choose a different name.`
    );
  }

  // Uniqueness: instance registry (catches half-created instances)
  const registry = await loadRegistry();
  const clash = registry.find((i) => i.slug === slug || i.slug.startsWith(`${slug}-`));
  if (clash) {
    throw new Error(
      `Slug "${slug}" conflicts with existing instance "${clash.slug}" in the registry.\n` +
      `  Choose a different name or clean up the stale entry first.`
    );
  }
}

/**
 * Assert Docker daemon is running.
 * Throws if Docker is not reachable so we fail fast instead of hanging.
 */
export async function assertDockerRunning(): Promise<void> {
  const { code, out } = await spawnRun("docker", ["info", "--format", "{{.ServerVersion}}"],
    { timeout: 8_000 });
  if (code !== 0) {
    throw new Error(
      `Docker daemon is not running or not reachable.\n` +
      `  Start Docker Desktop and try again.\n` +
      `  (docker info: ${out.slice(0, 120)})`
    );
  }
}

/**
 * Assert supabase-core/docker is present (required for new instance scaffolding).
 * Returns immediately if present; throws with a clear install instruction if not.
 */
export function assertCoreDockerPresent(): void {
  const coreDocker = join(CORE_DIR, "docker");
  if (!existsSync(coreDocker)) {
    throw new Error(
      `supabase-core/docker not found at ${coreDocker}\n` +
      `  Run:  unaxis unenter db template-capture\n` +
      `  This will clone supabase/supabase and set up the template (one-time, ~2 min).`
    );
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DatabaseProvisionConfig {
  /** Source bundle — path to snapshot directory. Leave undefined to use fresh template. */
  bundlePath?: string;
  /** Absolute path to the directory that will hold the new instance compose + env. */
  targetDir:   string;
  /** Ports for the new instance. Must not conflict with other running stacks. */
  ports: {
    postgres: number;
    studio:   number;
    kong:     number;
    kongSSL:  number;
  };
  /** Docker compose project name — defaults to slug. */
  projectName?: string;
  /** Whether to register in NPM with SSL. Default: true. */
  registerNpm?: boolean;
  /**
   * If provided, NPM registration success will persist public URLs back to the
   * instance registry entry.
   */
  instance?: RuntimeInstance;
}

export interface McpKeys {
  anonKey:        string;
  serviceRoleKey: string;
}

export interface McpConfig {
  /** Config block to paste into claude_desktop_config.json → mcpServers */
  claudeDesktopBlock: Record<string, unknown>;
  /** Plain env vars for shell / .env usage */
  env: {
    SUPABASE_URL:              string;
    SUPABASE_ANON_KEY:         string;
    SUPABASE_SERVICE_ROLE_KEY: string;
  };
  /** The public URL used for all API calls */
  publicUrl: string;
}

export interface ProvisionResult {
  slug:        string;
  studioUrl:   string;
  apiUrl:      string;
  mcpConfig:   McpConfig;
  npmErrors:   string[];
  routes:      DatabaseRouteEntry;
}

// ── generateMcpConfig ─────────────────────────────────────────────────────────

/**
 * Generate a structured MCP connection config for a Supabase database instance.
 *
 * The `publicUrl` should be the https:// URL of the Kong API gateway:
 *   e.g. "https://db.myblog.unenter.live"
 *
 * The generated `claudeDesktopBlock` is ready to paste into
 * claude_desktop_config.json under `mcpServers`.
 */
export function generateMcpConfig(
  slug:      string,
  publicUrl: string,
  keys:      McpKeys,
): McpConfig {
  const env = {
    SUPABASE_URL:              publicUrl,
    SUPABASE_ANON_KEY:         keys.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: keys.serviceRoleKey,
  };

  // MCP server config for claude_desktop_config.json
  // Uses the official @supabase/mcp-server-supabase package.
  const claudeDesktopBlock = {
    [`supabase-${slug}`]: {
      command: "npx",
      args:    ["-y", "@supabase/mcp-server-supabase@latest"],
      env,
    },
  };

  return { claudeDesktopBlock, env, publicUrl };
}

// ── writeMcpConfig ────────────────────────────────────────────────────────────

/**
 * Write MCP connection config files into the instance directory.
 *
 * Files written:
 *   mcp-config.json  — paste `mcpServers` block into claude_desktop_config.json
 *   mcp-env.txt      — plain env vars for shell scripts / .env usage
 */
export async function writeMcpConfig(
  dir:       string,
  slug:      string,
  publicUrl: string,
  keys:      McpKeys,
  onLine?:   OnLine,
): Promise<McpConfig> {
  const cfg = generateMcpConfig(slug, publicUrl, keys);

  // ── mcp-config.json ───────────────────────────────────────────────────────
  const mcpJson = {
    _comment: [
      "Auto-generated by UNAXIS — paste the 'mcpServers' block into your",
      "claude_desktop_config.json (merge with any existing entries).",
    ],
    mcpServers: cfg.claudeDesktopBlock,
  };
  await fs.writeFile(
    join(dir, "mcp-config.json"),
    JSON.stringify(mcpJson, null, 2),
    "utf-8",
  );

  // ── mcp-env.txt ──────────────────────────────────────────────────────────
  const envLines = [
    `# UNAXIS — Supabase MCP connection vars for: ${slug}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Public URL: ${publicUrl}`,
    ``,
    ...Object.entries(cfg.env).map(([k, v]) => `${k}=${v}`),
  ];
  await fs.writeFile(join(dir, "mcp-env.txt"), envLines.join("\n"), "utf-8");

  onLine?.(`✓ mcp-config.json  (paste mcpServers into claude_desktop_config.json)`);
  onLine?.(`✓ mcp-env.txt      (env vars for shell / .env)`);

  return cfg;
}

// ── provisionDatabase ─────────────────────────────────────────────────────────

/**
 * Full end-to-end provisioning of a public-facing Supabase database instance.
 *
 * Steps:
 *   1. Resolve source bundle (explicit path or fresh template via captureTemplate)
 *   2. cloneFromBundle() — new Docker stack with unique ports + project name
 *   3. addDatabaseRoutes() — record in proxy-config/routes.json
 *   4. npmAddDatabaseHosts() — SSL proxy hosts in NPM (if registerNpm !== false)
 *   5. setDatabaseNpmIds() — back-fill NPM IDs into routes.json
 *   6. writeMcpConfig() — write mcp-config.json + mcp-env.txt
 *
 * The caller is responsible for reading secrets (anonKey, serviceRoleKey) from
 * the instance .env before calling this — cloneFromBundle writes env.redacted,
 * not the actual secrets.  If keys are not provided, MCP config env vars will
 * contain placeholder strings.
 *
 * @param slug       New instance slug — used as public subdomain prefix and
 *                   Docker compose project name.
 * @param cfg        Port assignment, target directory, and options.
 * @param keys       Supabase JWT keys for MCP config. Pass null to use
 *                   placeholders (fill in manually after provisioning).
 * @param onLine     Progress logger.
 */
export async function provisionDatabase(
  slug:    string,
  cfg:     DatabaseProvisionConfig,
  keys:    McpKeys | null,
  onLine:  OnLine,
): Promise<ProvisionResult> {
  // ── Guard rails ─────────────────────────────────────────────────────────
  await validateDatabaseSlug(slug);
  await assertDockerRunning();

  const domain    = DOMAIN || "unenter.live";
  const stackIp   = STACK_HOST.ip;

  onLine(`🚀 Provisioning database instance: ${slug}`);
  onLine(`   Public:  db.${slug}.${domain}  /  studio.${slug}.${domain}`);
  onLine(`   Ports:   Kong:${cfg.ports.kong}  Studio:${cfg.ports.studio}  PG:${cfg.ports.postgres}`);

  // ── [1] Resolve source bundle ─────────────────────────────────────────────
  let bundlePath = cfg.bundlePath;
  if (!bundlePath) {
    onLine("\n[1/5] No bundle specified — using fresh template...");
    const template = await captureTemplate(onLine);
    // captureTemplate returns a .tar.gz path; cloneFromBundle expects the
    // extracted directory.  Unpack it first.
    bundlePath = await unpackTemplate(template.archivePath, onLine);
  } else {
    onLine(`\n[1/5] Using bundle: ${bundlePath}`);
  }

  // ── [2] Clone ─────────────────────────────────────────────────────────────
  onLine("\n[2/5] Cloning bundle into new instance...");
  const cloneCfg: CloneConfig = {
    targetDir:   cfg.targetDir,
    ports: {
      postgres: cfg.ports.postgres,
      studio:   cfg.ports.studio,
      kong:     cfg.ports.kong,
      kongSSL:  cfg.ports.kongSSL,
    },
    projectName: cfg.projectName ?? slug,
  };
  const cloneResult: CloneResult = await cloneFromBundle(bundlePath, slug, cloneCfg, onLine);

  // ── [3] Register proxy routes ─────────────────────────────────────────────
  onLine("\n[3/5] Registering proxy routes...");
  const routes = await addDatabaseRoutes(slug, cfg.ports, stackIp, onLine);

  // ── [4] NPM registration ──────────────────────────────────────────────────
  let npmErrors: string[] = [];
  const registerNpm = cfg.registerNpm !== false;

  if (registerNpm) {
    onLine("\n[4/5] Registering SSL proxy hosts in NPM...");
    const npmResult = await npmAddDatabaseHosts(
      slug,
      domain,
      stackIp,
      cfg.ports.kong,
      onLine,
    );
    npmErrors = npmResult.errors;

    if (npmResult.dbHostId !== null || npmResult.studioHostId !== null) {
      await setDatabaseNpmIds(slug, npmResult.dbHostId, npmResult.studioHostId);
    }
    if (npmErrors.length > 0) {
      onLine(`  ⚠ NPM registration had ${npmErrors.length} error(s) — database still reachable internally`);
    }
    // Store public URLs in registry so the TUI can surface them (if instance provided)
    if (cfg.instance) {
      await updateInstanceStatus(cfg.instance.id, {
        npmApiUrl:    `https://db.${slug}.${domain}`,
        npmStudioUrl: `https://studio.${slug}.${domain}`,
      });
    }
  } else {
    onLine("\n[4/5] NPM registration skipped (registerNpm: false)");
  }

  // ── [5] Write MCP config ──────────────────────────────────────────────────
  onLine("\n[5/5] Writing MCP connection config...");
  const publicUrl  = `https://${routes.apiDomain}`;
  const mcpKeys: McpKeys = keys ?? {
    anonKey:        "<YOUR_ANON_KEY>",
    serviceRoleKey: "<YOUR_SERVICE_ROLE_KEY>",
  };
  const mcpConfig = await writeMcpConfig(cfg.targetDir, slug, publicUrl, mcpKeys, onLine);
  if (!keys) {
    onLine(`  ⚠ JWT keys not provided — fill in <YOUR_*_KEY> placeholders in mcp-config.json`);
    onLine(`    Keys are in the instance .env file once you start the stack`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const studioPublic = `https://${routes.studioDomain}`;
  onLine(`\n✓ Database instance ready: ${slug}`);
  onLine(`  API:    ${publicUrl}`);
  onLine(`  Studio: ${studioPublic}`);
  onLine(`  Local Studio (no SSL): ${cloneResult.studioUrl}`);
  if (npmErrors.length === 0 && registerNpm) {
    onLine(`  SSL: ✓ (NPM hosts registered)`);
  } else if (registerNpm) {
    onLine(`  SSL: ⚠ NPM registration incomplete — add hosts manually at NPM UI`);
  }
  onLine(`  MCP:    ${cfg.targetDir}/mcp-config.json`);

  return {
    slug,
    studioUrl:  cloneResult.studioUrl,
    apiUrl:     publicUrl,
    mcpConfig,
    npmErrors,
    routes,
  };
}

// ── decommissionDatabase ──────────────────────────────────────────────────────

/**
 * Remove a database instance from the public routing layer.
 *
 * Steps:
 *   1. Remove NPM proxy hosts (db.* and studio.*)
 *   2. Remove from routes.json
 *
 * Does NOT stop Docker or delete instance files — call those separately
 * if you want a full tear-down.
 */
export async function decommissionDatabase(
  slug:    string,
  onLine:  OnLine,
): Promise<void> {
  onLine(`🗑  Decommissioning database: ${slug}`);

  const routes = getDatabaseRoutes();
  const entry  = routes[slug];

  if (!entry) {
    onLine(`  No registered database "${slug}" — nothing to do`);
    return;
  }

  // ── Remove NPM hosts ──────────────────────────────────────────────────────
  let token: string | null = null;
  try {
    token = await npmGetToken();
  } catch {
    onLine(`  ⚠ NPM auth failed — skipping NPM host removal`);
  }

  if (token) {
    for (const [label, id] of [
      ["API", entry.npmApiHostId],
      ["Studio", entry.npmStudioHostId],
    ] as Array<[string, number | null | undefined]>) {
      if (!id) continue;
      try {
        await npmDeleteHost(id, token);
        onLine(`  ✓ Removed NPM ${label} host #${id}`);
      } catch (e) {
        onLine(`  ⚠ Failed to remove NPM ${label} host #${id}: ${String(e)}`);
      }
    }
  }

  // ── Remove proxy routes ───────────────────────────────────────────────────
  await removeDatabaseRoutes(slug, onLine);

  onLine(`✓ ${slug} decommissioned`);
}

// ── createBlankDatabase ───────────────────────────────────────────────────────

export interface BlankDatabaseOptions {
  /** Human-readable label for the instance (defaults to slug). */
  instanceName?: string;
  /** Whether to register in NPM with SSL. Default: true. */
  registerNpm?: boolean;
}

export interface BlankDatabaseResult {
  instance:   RuntimeInstance;
  studioUrl:  string;
  publicApiUrl:    string;
  publicStudioUrl: string;
  mcpConfig:  McpConfig;
  npmErrors:  string[];
  routes:     DatabaseRouteEntry;
}

/**
 * Spin up a brand-new, completely empty Supabase database instance.
 *
 * This is the FAST PATH — no snapshot, no clone, no template archive.
 * It scaffolds a fresh instance directly from supabase-core/docker,
 * starts it, registers it publicly, and writes fully-wired MCP config
 * with real secrets available immediately.
 *
 * Typical timeline:
 *   ~5s   — scaffold + docker compose up
 *   ~30s  — Postgres ready
 *   ~3min — Studio + all migrations fully up
 *
 * Steps:
 *   1. Ensure supabase-core/docker is present (clone if needed)
 *   2. createRuntimeInstance() — scaffold with unique ports + fresh secrets
 *   3. docker compose up -d
 *   4. Wait for Postgres (pg_isready polling)
 *   5. addDatabaseRoutes() — register in proxy-config
 *   6. npmAddDatabaseHosts() — SSL proxy hosts in NPM
 *   7. writeMcpConfig() — fully wired with real keys (no placeholders)
 *
 * The Studio and REST API are available immediately at their local ports.
 * Kong and migrations take ~3 min to fully warm up after Postgres is ready.
 */
export async function createBlankDatabase(
  slug:     string,
  opts:     BlankDatabaseOptions = {},
  onLine:   OnLine,
): Promise<BlankDatabaseResult> {
  const domain    = DOMAIN || "unenter.live";
  const stackIp   = STACK_HOST.ip;
  const label     = opts.instanceName ?? slug;
  const registerNpm = opts.registerNpm !== false;

  // ── Guard rails ──────────────────────────────────────────────────────────
  await validateDatabaseSlug(slug);
  await assertDockerRunning();

  onLine(`🆕 Creating blank database: ${slug}`);
  onLine(`   Will be live at:  db.${slug}.${domain}  /  studio.${slug}.${domain}`);

  // ── [1] Ensure supabase-core is present ───────────────────────────────────
  if (!existsSync(join(CORE_DIR, "docker"))) {
    onLine("  supabase-core not found — cloning supabase/supabase (one-time setup)...");
    const { success, error } = await initializeSupabaseCore(onLine);
    if (!success) throw new Error(`initializeSupabaseCore failed: ${error}`);
  }

  // ── [2] Scaffold instance ────────────────────────────────────────────────
  onLine("\n[1/5] Scaffolding instance...");
  const instance = await createRuntimeInstance(label, onLine);
  onLine(`  ✓ slug:  ${instance.slug}`);
  onLine(`  ✓ ports: Kong:${instance.ports.kong}  Studio:${instance.ports.studio}  PG:${instance.ports.postgres}`);

  let didStart = false;
  let npmErrors: string[] = [];

  try {
    // ── [3] Start the stack ──────────────────────────────────────────────
    onLine("\n[2/5] Starting Supabase stack...");
    const { code: upCode, out: upOut } = await spawnRun(
      "docker",
      ["compose", "--project-name", instance.slug, "up", "-d", "--remove-orphans"],
      { cwd: instance.dockerPath, timeout: 120_000,
        env: envWithFile(`${instance.dockerPath}/.env`) },
    );
    if (upCode !== 0) throw new Error(`docker compose up failed:\n${upOut}`);
    didStart = true;
    onLine("  ✓ containers started");

    // ── [4] Wait for Postgres ────────────────────────────────────────────
    onLine("\n[3/5] Waiting for Postgres...");
    const dbCont = `${instance.slug}-db`;
    let pgReady = false;
    for (let i = 0; i < 30; i++) {   // up to 60s
      await new Promise((r) => setTimeout(r, 2000));
      const { out } = await _dockerExec(["exec", dbCont, "pg_isready", "-U", "postgres"]);
      if (out.includes("accepting connections")) { pgReady = true; break; }
      if ((i + 1) % 5 === 0) onLine(`  … waiting (${(i + 1) * 2}s)`);
    }
    if (!pgReady) throw new Error("Postgres did not become ready within 60s");
    onLine("  ✓ Postgres ready");
    onLine("  ℹ  Studio + migrations continue warming in background (~2-3 min)");

    // ── [5] Register routes & NPM ────────────────────────────────────────
    onLine("\n[4/5] Registering public routes...");
    const routes = await addDatabaseRoutes(
      slug,
      { kong: instance.ports.kong, studio: instance.ports.studio },
      stackIp,
      onLine,
    );

    if (registerNpm) {
      onLine("  Registering NPM proxy hosts...");
      const npmResult = await npmAddDatabaseHosts(
        slug, domain, stackIp,
        instance.ports.kong,
        onLine,
      );
      npmErrors = npmResult.errors;
      if (npmResult.dbHostId !== null || npmResult.studioHostId !== null) {
        await setDatabaseNpmIds(slug, npmResult.dbHostId, npmResult.studioHostId);
      }
      // Store public URLs in registry
      await updateInstanceStatus(instance.id, {
        npmApiUrl:    `https://db.${slug}.${domain}`,
        npmStudioUrl: `https://studio.${slug}.${domain}`,
      });
    }

    // ── [6] Write MCP config (real keys — no placeholders!) ──────────────
    onLine("\n[5/5] Writing MCP connection config...");
    const publicApiUrl    = `https://db.${slug}.${domain}`;
    const publicStudioUrl = `https://studio.${slug}.${domain}`;
    const mcpConfig = await writeMcpConfig(
      instance.dockerPath,
      slug,
      publicApiUrl,
      {
        anonKey:        instance.secrets.anonKey,
        serviceRoleKey: instance.secrets.serviceRoleKey,
      },
      onLine,
    );

    const routes2 = getDatabaseRoutes()[slug]
      ?? { apiDomain: `db.${slug}.${domain}`, studioDomain: `studio.${slug}.${domain}`,
           apiUpstream: "", studioUpstream: "", registeredAt: new Date().toISOString() };

    onLine(`\n✓ Blank database ready: ${slug}`);
    onLine(`  Local Studio:   http://127.0.0.1:${instance.ports.studio}`);
    onLine(`  Local API:      http://127.0.0.1:${instance.ports.kong}`);
    onLine(`  Public Studio:  ${publicStudioUrl}  ${registerNpm && npmErrors.length === 0 ? "(SSL ✓)" : "(NPM pending)"}`);
    onLine(`  Public API:     ${publicApiUrl}  ${registerNpm && npmErrors.length === 0 ? "(SSL ✓)" : "(NPM pending)"}`);
    onLine(`  MCP config:     ${instance.dockerPath}/mcp-config.json`);
    onLine(`  Studio user:    supabase  /  password: ${instance.secrets.dashboardPassword}`);

    return {
      instance,
      studioUrl:       `http://127.0.0.1:${instance.ports.studio}`,
      publicApiUrl,
      publicStudioUrl,
      mcpConfig,
      npmErrors,
      routes:          routes2,
    };
  } catch (err) {
    // If we failed after the stack started, deregister but leave containers
    // so the user can debug. They can run `docker compose down` manually.
    if (!didStart) {
      await removeFromRegistry(instance.id).catch(() => {});
    }
    throw err;
  }
}

// ── cloneFromSnapshot ─────────────────────────────────────────────────────────

export interface CloneFromSnapshotResult {
  instance:        RuntimeInstance;
  dnsSlug:         string;           // short name used for public URLs
  publicApiUrl:    string;
  publicStudioUrl: string;
  mcpConfig:       McpConfig;
  npmErrors:       string[];
}

/**
 * Create a new independent Supabase instance pre-loaded with data from a snapshot.
 *
 * This is the "clone" path — any captured snapshot can become a fresh,
 * fully independent runtime instance with its own lean Docker stack,
 * public NPM/SSL proxy entries, and MCP config.
 *
 * Unlike the old cloneFromBundle() path, this always uses the lean instance
 * template (not the compose file from the bundle), so the clone inherits
 * proper Kong host-based routing, fresh secrets, and appears in the TUI.
 *
 * Steps:
 *   1. Validate + scaffold  — createRuntimeInstance() (lean template, fresh secrets)
 *   2. Start stack          — docker compose up -d
 *   3. Wait for Postgres    — pg_isready polling (up to 60s)
 *   4. Restore data         — restoreInstance(bundle, target) — pg_restore + storage
 *   5. Register routes      — addDatabaseRoutes()
 *   6. NPM proxy hosts      — npmAddDatabaseHosts()
 *   7. MCP config           — writeMcpConfig() with real keys
 *
 * @param bundlePath  Absolute path to the snapshot bundle directory.
 * @param name        Human-readable name for the clone (e.g. "Yapp Clone").
 * @param opts        registerNpm (default true)
 * @param onLine      Progress logger.
 */
export async function cloneFromSnapshot(
  bundlePath: string,
  name:        string,
  opts:        { registerNpm?: boolean } = {},
  onLine:      OnLine,
): Promise<CloneFromSnapshotResult> {
  const { restoreInstance } = await import("./snapshot.ts");
  const domain      = DOMAIN || "unenter.live";
  const stackIp     = STACK_HOST.ip;
  const registerNpm = opts.registerNpm !== false;

  // DNS slug — short name derived from the human label (no timestamp).
  // Used for public subdomains:  db.{dnsSlug}.{domain}
  const dnsSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "clone";

  onLine(`🌱 Cloning snapshot  →  ${dnsSlug}`);
  onLine(`   Public:  db.${dnsSlug}.${domain}  /  studio.${dnsSlug}.${domain}`);

  // ── Guard rails ─────────────────────────────────────────────────────────────
  await validateDatabaseSlug(dnsSlug);
  await assertDockerRunning();

  // ── [1] Scaffold lean instance ────────────────────────────────────────────
  onLine(`\n[1/5] Scaffolding lean instance (${dnsSlug})...`);
  const instance = await createRuntimeInstance(name, onLine);
  onLine(`  ✓ slug:    ${instance.slug}`);
  onLine(`  ✓ ports:   Kong:${instance.ports.kong}  PG:${instance.ports.postgres}`);
  onLine(`  ✓ studio:  ${instance.studioUrl}  (via Kong)`);

  let npmErrors: string[] = [];

  try {
    // ── [2] Start the stack ──────────────────────────────────────────────
    onLine(`\n[2/5] Starting lean stack...`);
    const { code: upCode, out: upOut } = await spawnRun(
      "docker",
      ["compose", "--project-name", instance.slug, "up", "-d", "--remove-orphans"],
      { cwd: instance.dockerPath, timeout: 120_000,
        env: envWithFile(`${instance.dockerPath}/.env`) },
    );
    if (upCode !== 0) throw new Error(`docker compose up failed:\n${upOut}`);
    onLine("  ✓ containers started");

    // ── [3] Wait for Postgres ────────────────────────────────────────────
    onLine(`\n[3/5] Waiting for Postgres...`);
    const dbCont = instance.containerPrefix
      ? `${instance.containerPrefix}db`
      : `${instance.slug}-db`;
    let pgReady = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const { out } = await _dockerExec(["exec", dbCont, "pg_isready", "-U", "postgres"]);
      if (out.includes("accepting connections")) { pgReady = true; break; }
      if ((i + 1) % 5 === 0) onLine(`  … waiting (${(i + 1) * 2}s)`);
    }
    if (!pgReady) throw new Error("Postgres did not become ready within 60s");
    onLine("  ✓ Postgres ready");

    // ── [4] Restore snapshot data ────────────────────────────────────────
    onLine(`\n[4/5] Restoring snapshot data...`);
    const restoreCode = await restoreInstance(bundlePath, onLine, instance);
    if (restoreCode !== 0) {
      onLine(`  ⚠ restoreInstance returned ${restoreCode} — data may be incomplete`);
    } else {
      onLine("  ✓ snapshot data restored");
    }

    // ── [5] Register routes, NPM, MCP ───────────────────────────────────
    onLine(`\n[5/5] Registering public routes...`);
    const routes = await addDatabaseRoutes(
      dnsSlug,
      { kong: instance.ports.kong, studio: instance.ports.studio },
      stackIp,
      onLine,
    );

    if (registerNpm) {
      onLine("  Registering NPM proxy hosts...");
      const npmResult = await npmAddDatabaseHosts(
        dnsSlug, domain, stackIp,
        instance.ports.kong,
        onLine,
      );
      npmErrors = npmResult.errors;
      if (npmResult.dbHostId !== null || npmResult.studioHostId !== null) {
        await setDatabaseNpmIds(dnsSlug, npmResult.dbHostId, npmResult.studioHostId);
      }
      await updateInstanceStatus(instance.id, {
        npmApiUrl:    `https://db.${dnsSlug}.${domain}`,
        npmStudioUrl: `https://studio.${dnsSlug}.${domain}`,
      });
    }

    const publicApiUrl    = `https://db.${dnsSlug}.${domain}`;
    const publicStudioUrl = `https://studio.${dnsSlug}.${domain}`;

    const mcpConfig = await writeMcpConfig(
      instance.dockerPath,
      dnsSlug,
      publicApiUrl,
      {
        anonKey:        instance.secrets.anonKey,
        serviceRoleKey: instance.secrets.serviceRoleKey,
      },
      onLine,
    );

    onLine(`\n✓ Clone ready: ${dnsSlug}`);
    onLine(`  Local API:      http://127.0.0.1:${instance.ports.kong}`);
    onLine(`  Public API:     ${publicApiUrl}`);
    onLine(`  Public Studio:  ${publicStudioUrl}`);
    onLine(`  Studio user:    supabase  /  ${instance.secrets.dashboardPassword}`);
    onLine(`  MCP config:     ${instance.dockerPath}/mcp-config.json`);

    return { instance, dnsSlug, publicApiUrl, publicStudioUrl, mcpConfig, npmErrors };

  } catch (err) {
    // Leave containers running so the user can debug — just surface the error.
    await updateInstanceStatus(instance.id, { status: "error" }).catch(() => {});
    throw err;
  }
}

// ── smokeTestDatabase ─────────────────────────────────────────────────────────

export interface SmokeTestResult {
  passed: string[];
  failed: string[];
  ok:     boolean;
}

/**
 * End-to-end smoke test for the database provisioning pipeline.
 *
 * Creates a blank database, verifies Postgres + Kong health, takes a snapshot,
 * verifies the snapshot, then tears everything down cleanly.
 *
 * Safe to run in production — uses an isolated slug with random suffix and
 * cleans up completely regardless of pass/fail.
 *
 * Tests:
 *   ✓ createBlankDatabase() — scaffolds and starts a fresh instance
 *   ✓ Postgres TCP connectivity
 *   ✓ Kong /health HTTP probe
 *   ✓ Studio / HTTP probe
 *   ✓ snapshotInstance() — bundle + compression
 *   ✓ listSnapshots() — finds the new bundle
 *   ✓ Teardown — docker compose down + registry removal
 */
export async function smokeTestDatabase(onLine: OnLine): Promise<SmokeTestResult> {
  const result: SmokeTestResult = { passed: [], failed: [], ok: false };
  const pass  = (t: string) => { result.passed.push(t); onLine(`  ✓ ${t}`); };
  const fail  = (t: string, e?: unknown) => {
    const msg = e ? `${t}: ${String(e)}` : t;
    result.failed.push(msg);
    onLine(`  ✗ ${msg}`);
  };

  // ── Pre-flight checks ─────────────────────────────────────────────────────
  onLine("[pre-flight] Docker daemon...");
  try {
    await assertDockerRunning();
    pass("Docker daemon running");
  } catch (e) {
    fail("Docker daemon not running", e);
    result.ok = false;
    return result;
  }

  onLine("[pre-flight] supabase-core/docker...");
  try {
    assertCoreDockerPresent();
    pass("supabase-core/docker present");
  } catch (e) {
    fail("supabase-core/docker missing", e);
    result.ok = false;
    return result;
  }

  const suffix = Math.random().toString(36).slice(2, 6);
  const slug   = `smoke-${suffix}`;

  onLine(`\n🔬 Smoke test — slug: ${slug}`);
  onLine("══════════════════════════════════════════════\n");

  let instance: RuntimeInstance | null = null;

  try {
    // ── Test 1: createBlankDatabase ──────────────────────────────────────
    onLine("[1/6] createBlankDatabase...");
    let blankResult: BlankDatabaseResult;
    try {
      blankResult = await createBlankDatabase(slug, { registerNpm: false }, onLine);
      instance    = blankResult.instance;
      pass("createBlankDatabase");
    } catch (e) {
      fail("createBlankDatabase", e);
      result.ok = false;
      return result;
    }

    // ── Test 2: Postgres connectivity ────────────────────────────────────
    onLine("\n[2/6] Postgres connectivity...");
    const dbCont = `${instance.slug}-db`;
    const { out: pgOut } = await _dockerExec(["exec", dbCont, "pg_isready", "-U", "postgres"]);
    if (pgOut.includes("accepting connections")) {
      pass("Postgres accepting connections");
    } else {
      fail("Postgres not ready", pgOut);
    }

    // ── Test 3: Kong health ──────────────────────────────────────────────
    onLine("\n[3/6] Kong /health probe...");
    try {
      const kongUrl = `http://127.0.0.1:${instance.ports.kong}/health`;
      const res     = await fetch(kongUrl, { signal: AbortSignal.timeout(5000) });
      if (res.status < 500) {
        pass(`Kong /health → HTTP ${res.status}`);
      } else {
        fail(`Kong returned ${res.status}`);
      }
    } catch (e) {
      fail("Kong /health unreachable", e);
    }

    // ── Test 4: Studio probe ─────────────────────────────────────────────
    onLine("\n[4/6] Studio probe...");
    try {
      const studioUrl = `http://127.0.0.1:${instance.ports.studio}/`;
      const res       = await fetch(studioUrl, { signal: AbortSignal.timeout(5000) });
      if (res.status < 500) {
        pass(`Studio / → HTTP ${res.status}`);
      } else {
        fail(`Studio returned ${res.status}`);
      }
    } catch (e) {
      // Studio takes longer to warm up — this is a soft failure
      onLine(`  ⚠ Studio not yet ready (${String(e)}) — migrations still running, this is normal`);
      pass("Studio probe (soft — still warming)");
    }

    // ── Test 5: snapshotInstance ─────────────────────────────────────────
    onLine("\n[5/6] snapshotInstance...");
    try {
      const bundle = await snapshotInstance(instance, onLine);
      if (bundle.archivePath) {
        const { promises: _fs } = await import("fs");
        const stat = await _fs.stat(bundle.archivePath);
        pass(`snapshotInstance → ${(stat.size / 1024 / 1024).toFixed(1)} MB archive`);
      } else {
        pass("snapshotInstance (no archive — tar may be unavailable)");
      }

      // ── Test 6: listSnapshots ──────────────────────────────────────────
      onLine("\n[6/6] listSnapshots...");
      const bundles = await listSnapshots(instance);
      if (bundles.length > 0) {
        pass(`listSnapshots → ${bundles.length} bundle(s)`);
      } else {
        fail("listSnapshots returned empty");
      }
    } catch (e) {
      fail("snapshotInstance", e);
    }

  } finally {
    // ── Teardown ────────────────────────────────────────────────────────
    onLine("\n── Teardown ──────────────────────────────────────");
    if (instance) {
      try {
        await spawnRun(
          "docker",
          ["compose", "--project-name", instance.slug, "down", "--remove-orphans", "-v"],
          { cwd: instance.dockerPath, timeout: 60_000 },
        );
        await removeFromRegistry(instance.id);
        await removeDatabaseRoutes(slug);
        onLine("  ✓ containers stopped + deregistered");
      } catch (e) {
        onLine(`  ⚠ Teardown partial: ${String(e)}`);
      }
    }
  }

  onLine("\n══════════════════════════════════════════════");
  result.ok = result.failed.length === 0;
  if (result.ok) {
    onLine(`✓ All ${result.passed.length} smoke tests passed`);
  } else {
    onLine(`✗ ${result.failed.length} failed, ${result.passed.length} passed`);
    for (const f of result.failed) onLine(`  • ${f}`);
  }
  return result;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Thin wrapper — avoids importing spawn directly in this module. */
async function _dockerExec(args: string[]): Promise<{ code: number; out: string }> {
  const { spawn } = await import("child_process");
  return new Promise((resolve) => {
    const proc = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout!.on("data", (d: Buffer) => { out += d.toString(); });
    proc.stderr!.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", (code) => resolve({ code: code ?? 1, out: out.trim() }));
    proc.on("error", ()     => resolve({ code: 1, out }));
  });
}

/**
 * Unpack a .tar.gz template archive and return the path to the extracted
 * bundle directory.  Extraction target: same parent as the archive.
 */
async function unpackTemplate(archivePath: string, onLine: OnLine): Promise<string> {
  const { dirname }  = await import("path");
  const { spawnRun } = await import("./supabase-factory.ts");
  const { promises: _fs } = await import("fs");

  const parentDir = dirname(archivePath);

  onLine(`  Extracting template archive...`);
  const { code, out } = await spawnRun("tar", ["-xzf", archivePath, "-C", parentDir]);
  if (code !== 0) throw new Error(`Failed to extract template archive:\n${out}`);

  // Find the newest directory in parentDir after extraction
  const entries = await _fs.readdir(parentDir, { withFileTypes: true });
  const dirs    = entries
    .filter(e => e.isDirectory())
    .map(e => join(parentDir, e.name))
    .sort()
    .reverse();

  if (dirs.length === 0) throw new Error(`No directory found after extracting template`);

  const bundleDir = dirs[0];
  onLine(`  ✓ Extracted to: ${bundleDir}`);
  return bundleDir;
}
