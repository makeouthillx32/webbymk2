import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { StackOp } from "../components/DetachedStack.tsx";
import type { RuntimeInstance } from "../zone/supabase-factory.ts";
import type { Zone } from "../../config/zones.ts";
import { PROXY } from "../../config/zones.ts";
import { backupDatabase, startCoreStack, stopCoreStack, restartCoreStack, removeCoreStack, healCoreStack } from "../db-api.ts";
import { devContainerName, devDomain, isDevRunning, startDevContainer, stopDevContainer } from "../dev-container.ts";
import { getStatus, getStatuses, composeRun, pullAndUp, removeZoneDockerArtifacts, recreateCoreService, syncSharedZonesCompose } from "../docker.ts";
import { startIpcServer, startRemoteIpcBridge } from "../ipc-server.ts";
import { captureDockerLogs, parseTail } from "../log-snapshot.ts";
import { parseLogTail, snapshotContainerLogs } from "../log-snapshot.ts";
import { loadZones, removeZone, restoreZone, setZoneHosting } from "../zone-store.ts";
import { fetchContainers, fetchContainerLogs, fetchImages, fetchVolumes, fetchNetworks, inspectContainer, fetchImageHistory, fetchDockerEvents, containerAction, fetchContainerStats, removeImage } from "../agent-client.ts";
import { probeEnvironments, probeStateTile } from "../env-probe.ts";
import { updateRemoteAgent } from "../agent-ops.ts";
import {
  loadEnvironments,
  getActiveEnvironment,
  setActiveEnvironment,
  environmentTypeLabel,
  pingAgentHealth,
  saveAgentStatus,
} from "../environment-store.ts";
import { reconcileProxyRoutes, deriveZoneUpstream } from "../proxy-config.ts";
import {
  appendTimeline,
  appendWatchText,
  beginWatch,
  endWatch,
  getActiveWatch,
  noteWatch,
  watchRoot,
  writeWatchText,
  type WatchMode,
} from "../watch-session.ts";
import {
  snapshotInstance,
  restoreInstance,
  listSnapshots,
  captureTemplate,
  listTemplates,
} from "../zone/snapshot.ts";
import {
  provisionDatabase,
  createBlankDatabase,
  provisionCodevDatabase,
  smokeTestDatabase,
  validateDatabaseSlug,
} from "../zone/database-manager.ts";
import { loadRegistry } from "../zone/supabase-factory.ts";
import { NPM_HOST } from "../../config/stack.ts";
import { addZoneRoute, getRoutes, removeZoneRoute } from "../proxy-config.ts";
import { deleteZoneNpmHost } from "../zone/npm-cleanup.ts";
import { buildAndDeploy, deployZone, deployAll, gitCommitAndPushZone, promoteVercelZone } from "../zone-build.ts";
import {
  deleteZone, deriveZone, findNextDevPort, LAYOUT_OPTIONS,
  type LayoutType, type AppFooterType,
} from "../zone-scaffold.ts";
import { createZonePipeline } from "../zone-pipeline.ts";
import { doctorComposeService }    from "../docker.ts";
import {
  npmAddZone, npmEnableHost, npmDisableHost, npmSecureDevHost,
} from "../npm/index.ts";
import { buildInfraServices, checkService, INFRA_SERVICES } from "../infra.ts";
import { eventBus } from "../../utils/eventBus.js";
import {
  ensureRuntimeEnv,
  getRuntimeKongUrl,
  getRuntimeServiceKey,
} from "../../utils/runtimeEnv.js";
import { UNAXIS_CLI_SCHEMA } from "../cli-schema.js";
import { fetchZoneVisibility, setZoneVisibility, type ZoneVisibility } from "../zone-visibility.js";
import type { NotificationType, NotificationPriority, NotificationOptions } from "../components/Notifications.js";
import { formatDockerWslVhdReport, inspectDockerWslVhd } from "../windows-wsl-vhd-guard.js";
import {
  formatTopology,
  isMediaRole,
  MEDIA_ROLES,
  renderDerivedConfig,
  renderEdgeConfig,
  type PortForward,
} from "../media-topology.js";
import {
  applyDerived,
  computeDrift,
  deployEdge,
  discoverHostFacts,
  findEnv,
  loadTopology,
  placeRole,
  seedFromLive,
  setGateway,
  unplaceRole,
  type ApplyTarget,
} from "../media-topology-store.js";
import { dbPatchHostFacts } from "../control-db.js";

declare const UNAXIS_VERSION: string;

type RunOpQueued = (
  title: string,
  run: (onLine: (line: string) => void) => Promise<number> | number,
  priority?: "now" | "next" | "later",
) => void;

type ZoneFooterPinRow = {
  key: string;
  label: string;
  domain: string;
  footer_pinned: boolean;
};

const ZONE_FOOTER_PIN_SELECT = "key,label,domain,footer_pinned";
const ZONE_FOOTER_PIN_USAGE =
  "zone <zone-key> status|tag|untag|pinned|logs|build|rebuild|deploy|pull|delete|doctor|dev <start|stop|restart|logs|secure>";

function getSupabaseRestConfig() {
  ensureRuntimeEnv(true);
  const kongUrl = getRuntimeKongUrl().replace(/\/+$/, "");
  const serviceKey = getRuntimeServiceKey();

  if (!serviceKey) {
    throw new Error("SERVICE_ROLE_KEY not loaded; cannot update Supabase zone tags");
  }

  return { kongUrl, serviceKey };
}

function supabaseRestHeaders(serviceKey: string, extra?: Record<string, string>) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...extra,
  };
}

function zoneKeyFilter(zoneKey: string) {
  return `eq.${encodeURIComponent(zoneKey)}`;
}

async function fetchZoneFooterPins(): Promise<Map<string, boolean>> {
  const { kongUrl, serviceKey } = getSupabaseRestConfig();
  const response = await fetch(
    `${kongUrl}/rest/v1/zones?select=key,footer_pinned&order=sort_order.asc`,
    { headers: supabaseRestHeaders(serviceKey) },
  );

  if (!response.ok) {
    throw new Error(`Supabase zone tag read failed (${response.status}): ${await response.text()}`);
  }

  const rows = await response.json() as Pick<ZoneFooterPinRow, "key" | "footer_pinned">[];
  return new Map(rows.map((row) => [row.key, row.footer_pinned === true]));
}

async function fetchZoneFooterPin(zoneKey: string): Promise<ZoneFooterPinRow | null> {
  const { kongUrl, serviceKey } = getSupabaseRestConfig();
  const response = await fetch(
    `${kongUrl}/rest/v1/zones?key=${zoneKeyFilter(zoneKey)}&select=${ZONE_FOOTER_PIN_SELECT}&limit=1`,
    { headers: supabaseRestHeaders(serviceKey) },
  );

  if (!response.ok) {
    throw new Error(`Supabase zone tag read failed (${response.status}): ${await response.text()}`);
  }

  const rows = await response.json() as ZoneFooterPinRow[];
  return rows[0] ?? null;
}

async function setZoneFooterPinned(zoneKey: string, pinned: boolean): Promise<ZoneFooterPinRow> {
  const { kongUrl, serviceKey } = getSupabaseRestConfig();
  const response = await fetch(
    `${kongUrl}/rest/v1/zones?key=${zoneKeyFilter(zoneKey)}&select=${ZONE_FOOTER_PIN_SELECT}`,
    {
      method: "PATCH",
      headers: supabaseRestHeaders(serviceKey, { Prefer: "return=representation" }),
      body: JSON.stringify({
        footer_pinned: pinned,
        updated_at: new Date().toISOString(),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Supabase zone tag update failed (${response.status}): ${await response.text()}`);
  }

  const rows = await response.json() as ZoneFooterPinRow[];
  const row = rows[0];
  if (!row) {
    throw new Error(`Supabase zone not found: ${zoneKey}`);
  }

  return row;
}

// Zone visibility helpers live in ../zone-visibility.ts (shared with the zones
// panel's [P] toggle so both drive the same catalog write).

// Spawn `docker <args>`, streaming output to onLine (indented), resolving the
// exit code. Shared by the build-doctor / build-mem / builder-reset commands.
async function dockerRun(
  cmdArgs: string[],
  onLine: (l: string) => void,
  timeoutMs?: number,
): Promise<number> {
  const { spawn } = await import("child_process");
  return new Promise((resolve) => {
    const p = spawn("docker", cmdArgs, { env: { ...process.env } });
    const emit = (b: Buffer) =>
      b.toString().split("\n").forEach((l) => { if (l.trim()) onLine("  " + l.trimEnd()); });
    p.stdout?.on("data", emit);
    p.stderr?.on("data", emit);
    const timer = timeoutMs ? setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, timeoutMs) : null;
    p.on("close", (code) => { if (timer) clearTimeout(timer); resolve(code ?? 0); });
    p.on("error", (e) => { if (timer) clearTimeout(timer); onLine(`  spawn error: ${e}`); resolve(1); });
  });
}

// The core stack cold-start: compose up -d, wait for db+kong health, then
// hydrate the control DB. This is the exact body of the `unaxis up` IPC
// command (see the `up:` handler below), pulled out to a standalone function
// so it can ALSO run automatically once at TUI boot (see the "self-heal on
// startup" effect near the end of this hook) — one code path for "I typed
// `unaxis up`" and "the TUI just launched and the stack is cold". Idempotent:
// running services are untouched (the startup run passes --no-recreate, see
// below); hydration UPSERTs.
export async function coldStartCoreStack(
  onLine: (l: string) => void,
  opts: { skipHydrate?: boolean; noRecreate?: boolean } = {},
): Promise<number> {
  onLine("── unaxis up · core stack cold-start ──");

  // 1. Docker daemon reachable? Retry with backoff instead of failing on the
  // first check — at PC-boot time Docker Desktop is often still initializing
  // (10-60s is normal), and this function also runs automatically at TUI
  // launch (see the startup self-heal effect), so a single-shot check would
  // spuriously fail every reboot race. Bounded at 90s; a human running
  // `unaxis up` by hand with Docker Desktop truly not running still gets a
  // clear answer, just not an instant one.
  const daemonDeadline = Date.now() + 90_000;
  let daemonUp = false;
  let attempt = 0;
  while (Date.now() < daemonDeadline) {
    attempt++;
    const dcode = await dockerRun(["version", "--format", "docker server {{.Server.Version}}"], () => {}, 10000);
    if (dcode === 0) { daemonUp = true; break; }
    onLine(`  waiting for Docker daemon… (attempt ${attempt})`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!daemonUp) {
    onLine("✗ Docker daemon unreachable after 90s");
    const report = await inspectDockerWslVhd();
    for (const line of formatDockerWslVhdReport(report)) onLine(line);
    onLine("No automatic Docker/WSL restart or VHD mutation was attempted.");
    return 1;
  }

  // 2. Core compose project up (root docker-compose.yml, project `unenter`)
  onLine("→ compose up -d (core stack)…");
  // --no-recreate for the automatic startup run: compose recreates any
  // container whose config hash changed, and the services carry
  // unaxis.version / unaxis.source-ref labels from env, which differ between
  // the dev and prod TUIs and change with every commit. So a plain `up -d` on
  // every dev-TUI restart recreated the whole core stack (db, auth, kong,
  // proxy, mediamtx) — a real outage, seen three times on 2026-09-30. A
  // self-heal should only start what's stopped or missing.
  const ccode = await composeRun(opts.noRecreate ? ["up", "-d", "--no-recreate"] : ["up", "-d"], onLine);
  if (ccode !== 0) {
    onLine("✗ compose up failed — see lines above");
    return ccode;
  }

  // 3. Wait (bounded) for the two services everything else depends on
  const CRITICAL = ["unt_db", "unt_kong"];
  onLine("→ waiting for db + kong health (max 120s)…");
  const deadline = Date.now() + 120_000;
  let healthy = false;
  while (Date.now() < deadline) {
    const st = await getStatuses(CRITICAL);
    if (CRITICAL.every((c) => st[c] === "running")) { healthy = true; break; }
    await new Promise((r) => setTimeout(r, 3000));
  }
  const finalSt = await getStatuses(CRITICAL);
  for (const c of CRITICAL) onLine(`  ${c.padEnd(10)} ${finalSt[c]}`);
  if (!healthy) {
    onLine("✗ db/kong not healthy after 120s — inspect: unaxis logs db --tail 60");
    return 1;
  }

  // 4. Hydrate control DB (zones + environments). Safe to re-run.
  // Route reconciliation must happen AFTER this step. The independent startup
  // effect can run before hydration and legitimately see zero zones, which
  // used to overwrite routes.json with an empty map until an operator manually
  // ran `sync-routes`.
  if (opts.skipHydrate) {
    onLine("→ reconciling proxy routes from existing control DB…");
    const [zones, envs] = await Promise.all([loadZones(), loadEnvironments()]);
    await reconcileProxyRoutes(zones, envs, (name) => getStatus(name), onLine);
    onLine("✓ core stack up · hydration skipped · proxy routes reconciled");
    return 0;
  }
  onLine("→ hydrating control DB from unenter.db…");
  const { migrateControlDb } = await import("../control-db-migrate.js");
  const mcode = await migrateControlDb(onLine);
  if (mcode !== 0) {
    onLine("⚠ stack is UP but hydration failed — retry: unaxis db migrate-control");
    return 4;
  }

  // 5. Rebuild the proxy map from the now-hydrated source of truth. This is
  // deliberately in the cold-start transaction rather than relying on the
  // concurrent best-effort boot effect.
  onLine("→ reconciling proxy routes after hydration…");
  const [zones, envs] = await Promise.all([loadZones(), loadEnvironments()]);
  await reconcileProxyRoutes(zones, envs, (name) => getStatus(name), onLine);

  onLine("✓ core stack up · control DB hydrated · proxy routes reconciled · unaxis fully operational");
  return 0;
}

// Guards the boot-time auto-heal (see the effect near the end of this hook)
// so it fires exactly once per process, not once per component remount.
let autoColdStartFired = false;

type UseIpcBridgeParams = {
  view: string;
  bgOps: StackOp[];
  proxyStatus: string;
  refreshEnvs: () => void | Promise<void>;
  runOpQueued: RunOpQueued;
  /** Foreground-visible runner: shows the op in the TUI stack AND tees output
   *  to the socket sink, returning the exit code. Used so IPC build/deploy
   *  ops appear in the human's stack instead of streaming only to the caller. */
  runOpVisible: (title: string, op: (onLine: (l: string) => void) => Promise<number>, sink?: (l: string) => void) => Promise<number>;
  coreDockerInstance: RuntimeInstance;
  addNotification: (message: string, type?: NotificationType, opts?: NotificationOptions) => void;
  /** Remove an op from the stack state (used by `stack clear`). */
  setBgOps: Dispatch<SetStateAction<StackOp[]>>;
  /** Fire an op's registered dismiss hook (dev/log cleanup) when clearing it. */
  triggerDismissHook: (opId: number) => void;
};

export function useIpcBridge({
  view,
  bgOps,
  proxyStatus,
  refreshEnvs,
  runOpQueued,
  runOpVisible,
  coreDockerInstance,
  addNotification,
  setBgOps,
  triggerDismissHook,
}: UseIpcBridgeParams) {  const ipcStateRef = useRef({
    view,
    bgOps,
    proxyStatus,
  });

  useEffect(() => {
    ipcStateRef.current = { view, bgOps, proxyStatus };
  }, [view, bgOps, proxyStatus]);

  // Stable ref so the IPC env-switch handler (defined once in useEffect) can
  // call refreshEnvs without closing over a stale version.
  const refreshEnvsRef = useRef(refreshEnvs);
  useEffect(() => { refreshEnvsRef.current = refreshEnvs; }, [refreshEnvs]);

  // Stable ref for addNotification — lets the notify IPC handler always reach
  // the current React context value without closing over a stale closure.
  const addNotificationRef = useRef(addNotification);
  useEffect(() => { addNotificationRef.current = addNotification; }, [addNotification]);

  // Stable refs so `stack clear` (handler defined once) can mutate stack state.
  const setBgOpsRef = useRef(setBgOps);
  useEffect(() => { setBgOpsRef.current = setBgOps; }, [setBgOps]);
  const triggerDismissHookRef = useRef(triggerDismissHook);
  useEffect(() => { triggerDismissHookRef.current = triggerDismissHook; }, [triggerDismissHook]);

  // ── IPC server — CLI agent bridge ─────────────────────────────────────────
  // Starts a local TCP server (127.0.0.1:50505) so external CLI calls like
  // `unaxis dev core` or `unaxis restart core` can drive the TUI operations
  // without needing a separate process.  The handlers call the same underlying
  // dev-container functions the TUI uses; the TUI refreshes via normal polling.
  useEffect(() => {
    // Keep a stable ref to zones so handlers always see the latest list.
    const resolveZone = async (key: string): Promise<Zone | null> => {
      const all = await loadZones();
      return all.find((z) => z.key === key || z.label?.toLowerCase() === key.toLowerCase()) ?? null;
    };

    const formatDevStatus = async (zone: Zone): Promise<string> => {
      const { bareDevConfig } = await import("../bare-dev.ts");
      const bare = bareDevConfig(zone);
      const where = bare ? `bare metal :${bare.port}` : devContainerName(zone);
      return `${(await isDevRunning(zone)) ? "● running" : "○ stopped"} (${where})`;
    };

    const printZoneStatus = async (zone: Zone, onLine: (line: string) => void) => {
      onLine(`${zone.label} · ${zone.domain}`);
      onLine(`  key       : ${zone.key}`);
      onLine(`  container : ${zone.container}`);
      try {
        const row = await fetchZoneFooterPin(zone.key);
        onLine(`  footer    : ${row?.footer_pinned ? "tagged" : "not tagged"}`);
      } catch (error) {
        onLine(`  footer    : unavailable (${error instanceof Error ? error.message : String(error)})`);
      }
      onLine(`  dev       : ${await formatDevStatus(zone)} → ${devDomain(zone)}`);
      onLine(`✓ zone status`);
      return 0;
    };

    const printZoneFooterPinStatus = async (zone: Zone, onLine: (line: string) => void) => {
      const row = await fetchZoneFooterPin(zone.key);
      if (!row) {
        onLine(`✗ zone not found in Supabase: "${zone.key}"`);
        return 1;
      }

      onLine(`${row.label} · ${row.domain}`);
      onLine(`  footer : ${row.footer_pinned ? "tagged" : "not tagged"}`);
      return 0;
    };

    const takeSessionSnapshot = async (reason = "manual snapshot"): Promise<string> => {
      const all = await loadZones();
      const { view: currentView, bgOps: currentOps, proxyStatus: currentProxy } = ipcStateRef.current;
      const zoneLines = await Promise.all(all.map(async (z) =>
        `  ${z.key.padEnd(18)} ${await formatDevStatus(z)}  ${z.domain}`
      ));
      const stackLines = currentOps.length === 0
        ? ["  stack empty"]
        : currentOps.map((op) => {
          const state = op.busy ? (op.dismissable ? "live" : "running") : "done";
          const last = op.lines[op.lines.length - 1];
          return `  #${op.id} ${state.padEnd(7)} ${op.title}${last ? ` · ${last}` : ""}`;
        });

      return [
        `UNAXIS watch snapshot`,
        `reason : ${reason}`,
        `time   : ${new Date().toISOString()}`,
        `cwd    : ${process.cwd()}`,
        `view   : ${currentView}`,
        `proxy  : ${currentProxy}`,
        "",
        "zones:",
        ...zoneLines,
        "",
        "stack:",
        ...stackLines,
        "",
      ].join("\n");
    };

    const argValue = (args: string[], name: string): string | undefined => {
      const idx = args.indexOf(name);
      return idx >= 0 ? args[idx + 1] : undefined;
    };

    const validMode = (value: string | undefined): WatchMode | undefined => {
      if (value === "light" || value === "dev" || value === "risky") return value;
      return undefined;
    };

    const server = startIpcServer({

      // unaxis --schema
      "--schema": async (_args, onLine) => {
        onLine(JSON.stringify(UNAXIS_CLI_SCHEMA, null, 2));
        return 0;
      },

      // unaxis events --watch
      events: async (args, onLine, onClose) => {
        if (!args.includes("--watch")) {
          onLine("✗ usage: events --watch");
          return 2;
        }

        const handleEvent = (event: string, payload: any) => {
          onLine(JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
        };

        const unsubscribe = eventBus.subscribe(handleEvent);
        onClose(() => {
          unsubscribe();
        });

        // Send an initial connected event
        handleEvent("connected", { message: "Streaming events..." });

        // Return a promise that never resolves, keeping the socket open
        return new Promise<number>(() => {});
      },

      // unaxis version  — TUI version + live agent ping on every registered environment
      // Returns package version immediately, then pings agents concurrently.
      // Offline fallback is handled in cli.tsx (prints pkg version if TUI is down).
      version: async (_args, onLine) => {
        const isDevTui = process.env.UNAXIS_DEV === "true";
        const _ver = isDevTui ? "dev" : (() => { try { return UNAXIS_VERSION; } catch { return "dev"; } })();
        onLine(`\nUNAXIS  ${_ver}\n`);
        const all = await loadEnvironments();
        if (all.length === 0) {
          onLine("  (no environments configured)");
          onLine("✓ version");
          return 0;
        }
        // Ping all environments concurrently for speed
        const results = await Promise.all(
          all.map(async (env) => {
            if (!env.agentUrl) return { env, online: false, version: "", detail: "no agent url" };
            const result = await pingAgentHealth(env);
            await saveAgentStatus(env.id, result);
            return { env, ...result };
          })
        );
        for (const r of results) {
          const dot     = r.online ? "●" : "○";
          const status  = r.online ? "online " : "offline";
          const ver     = r.online && r.version ? `agent v${r.version}` : (r.detail ?? "unreachable");
          const def     = r.env.isDefaultTarget ? "  (default)" : "";
          const host    = r.env.agentUrl.replace(/^https?:\/\//, "").replace(/:8888\/?$/, "");
          onLine(`  ${dot} ${r.env.name.padEnd(8)} ${host.padEnd(18)} ${status}  ${ver}${def}`);
        }
        onLine(`\n✓ version`);
        return 0;
      },

      // unaxis dev <zone>  — toggle dev container on/off
      dev: async (args, onLine) => {
        const zoneName = args[0];
        if (!zoneName) { onLine("✗ usage: dev <zone-key>"); return 1; }
        const zone = await resolveZone(zoneName);
        if (!zone) { onLine(`✗ zone not found: "${zoneName}"`); return 1; }
        if (await isDevRunning(zone)) return stopDevContainer(zone, onLine);
        return startDevContainer(zone, onLine);
      },

      // unaxis restart <zone>  — hard stop → start
      restart: async (args, onLine) => {
        const zoneName = args[0];
        if (!zoneName) { onLine("✗ usage: restart <zone-key>"); return 1; }
        const zone = await resolveZone(zoneName);
        if (!zone) { onLine(`✗ zone not found: "${zoneName}"`); return 1; }
        onLine(`Restarting dev container for ${zone.label}…`);
        const stopCode = await stopDevContainer(zone, onLine);
        if (stopCode !== 0) return stopCode;
        return startDevContainer(zone, onLine);
      },

      // unaxis recreate-core <service>  — force-recreate a ROOT docker-compose.yml
      // service (auth, app, db, kong, rest, realtime, storage, meta, studio, proxy)
      // so it picks up the current .env. Plain `restart` / `env restart <container>`
      // only stop+start the existing container, which keeps whatever env it was
      // created with — this is the one that actually re-reads .env, via
      // `docker compose up -d --force-recreate --no-deps <service>`.
      "recreate-core": async (args, onLine) => {
        const service = args[0];
        if (!service) {
          onLine("✗ usage: recreate-core <service>  (e.g. auth, app, storage — root docker-compose.yml service name)");
          return 2;
        }
        onLine(`Recreating "${service}" from root docker-compose.yml (force-recreate, re-reads .env)…`);
        const code = await recreateCoreService(service, onLine);
        if (code !== 0) {
          onLine(`✗ recreate failed for ${service} — see lines above`);
          return code;
        }
        onLine(`✓ ${service} recreated with current .env`);
        return 0;
      },

      // unaxis list  — show all zones and their dev container status
      list: async (_args, onLine) => {
        const all = await loadZones();
        if (all.length === 0) { onLine("(no zones configured)"); return 0; }
        for (const z of all) {
          onLine(`  ${z.key.padEnd(18)} ${await formatDevStatus(z)}  ${z.domain}`);
        }
        onLine(`✓ ${all.length} zone${all.length !== 1 ? "s" : ""}`);
        return 0;
      },

      // unaxis zones  — clearer alias for list
      zones: async (_args, onLine) => {
        const all = await loadZones();
        if (all.length === 0) { onLine("(no zones configured)"); return 0; }
        for (const z of all) {
          onLine(`  ${z.key.padEnd(18)} ${await formatDevStatus(z)}  ${z.domain}`);
        }
        onLine(`✓ ${all.length} zone${all.length !== 1 ? "s" : ""}`);
        return 0;
      },


      // unaxis overview [--json]
      // Structured project snapshot for agent consumption.
      // Default: JSON object on a single line (machine-readable).
      // --json flag: same (explicit).
      // --pretty flag: formatted human display.
      overview: async (args, onLine) => {
        const pretty = args.includes("--pretty");
        const all      = await loadZones();
        const registry = await loadRegistry().catch(() => []);
        const envs     = await loadEnvironments();
        const active   = envs.find((e: any) => e.active) ?? envs[0] ?? null;
        const proxyS   = ipcStateRef.current.proxyStatus;

        // ── Platform ────────────────────────────────────────────────────────
        const coreZone = all.find((z: any) => z.key === "unenter");
        const appStatus  = coreZone ? await getStatus(coreZone.container ?? "unt_app") : "missing";
        const proxyStatus = proxyS;

        // ── Zones ────────────────────────────────────────────────────────────
        const deployable = all.filter((z: any) =>
          z.key !== "unenter" && z.key !== "proxy" && z.hosting !== "vercel"
        );
        const zoneItems: { key: string; label: string; domain: string; status: string }[] = [];
        for (const z of deployable) {
          const s = await getStatus(z.container ?? z.key);
          zoneItems.push({ key: z.key, label: z.label, domain: z.domain, status: s });
        }
        const runningCount = zoneItems.filter((z) => z.status === "running").length;

        // ── Database ─────────────────────────────────────────────────────────
        const instanceItems = registry.map((inst: any) => ({
          slug:    inst.slug,
          id:      inst.id,
          health:  inst.healthState ?? "unknown",
          status:  inst.status      ?? "unknown",
          dbUrl:   `db.${inst.slug}.unenter.live`,
          studioUrl: `studio.${inst.slug}.unenter.live`,
        }));

        // ── Host ─────────────────────────────────────────────────────────────
        const os = await import("os");
        const cpus = os.cpus();
        let totalTick = 0, idleTick = 0;
        for (const cpu of cpus) {
          const vals = Object.values(cpu.times) as number[];
          totalTick += vals.reduce((a, b) => a + b, 0);
          idleTick  += cpu.times.idle;
        }
        const cpuPct   = parseFloat(((1 - idleTick / totalTick) * 100).toFixed(1));
        const memTotal = os.totalmem();
        const memFree  = os.freemem();
        const memUsed  = memTotal - memFree;

        // ── Assemble payload ─────────────────────────────────────────────────
        const payload = {
          ts:      new Date().toISOString(),
          project: active?.name ?? "unenter",
          env:     active?.type ?? "local-docker",
          domain:  "unenter.live",
          platform: {
            app:   { status: appStatus },
            proxy: { status: proxyStatus },
          },
          zones: {
            total:   deployable.length,
            running: runningCount,
            items:   zoneItems,
          },
          database: {
            core:      { status: "active" },
            instances: instanceItems,
          },
          host: {
            cpuPct,
            memUsedMb:  Math.round(memUsed  / 1024 / 1024),
            memFreeMb:  Math.round(memFree  / 1024 / 1024),
            memTotalMb: Math.round(memTotal / 1024 / 1024),
            uptimeSec:  Math.round(os.uptime()),
          },
        };

        if (pretty) {
          // ── Human display ──────────────────────────────────────────────────
          const dot = (s: string) =>
            s === "running" || s === "active" ? "●" :
            s === "starting" || s === "degraded" ? "◐" : "○";

          onLine(`Project  ${payload.project}  ·  ${payload.domain}  ·  ${payload.env}`);
          onLine("");
          onLine(`Platform`);
          onLine(`  ${dot(appStatus)}  App     ${coreZone?.domain ?? "unenter.live"}`);
          onLine(`  ${dot(proxyStatus)}  Proxy   :3080`);
          onLine("");
          onLine(`Zones  (${runningCount}/${deployable.length} running)`);
          for (const z of zoneItems) {
            onLine(`  ${dot(z.status)}  ${z.label.padEnd(18)} ${z.domain}`);
          }
          onLine("");
          onLine(`Database  (1 core + ${instanceItems.length} instance${instanceItems.length !== 1 ? "s" : ""})`);
          onLine(`  ●  Core     db.unenter.live  (active)`);
          for (const inst of instanceItems) {
            onLine(`  ${dot(inst.health)}  ${inst.slug.padEnd(8)} ${inst.dbUrl}  (${inst.health})`);
          }
          onLine("");
          onLine(`Host  CPU ${cpuPct}%  ·  RAM ${payload.host.memUsedMb} MB used / ${payload.host.memFreeMb} MB free  ·  up ${Math.round(payload.host.uptimeSec / 3600)}h`);
          return 0;
        }

        // Default: single JSON line — parseable by agent
        onLine(JSON.stringify(payload));
        return 0;
      },


      // unaxis sync-routes
      // Rebuild proxy-config/routes.json from all live zones + environments.
      // Upstreams are derived from zone.environmentId — container DNS for local
      // zones, host IP for remote zones. The proxy hot-reloads this file.
      // TUI equivalent: CoreView → Proxy → [sync-routes] action.
      "sync-routes": async (_args, onLine) => {
        const [zones, envs] = await Promise.all([loadZones(), loadEnvironments()]);
        await reconcileProxyRoutes(zones, envs, (name) => getStatus(name), onLine);
        return 0;
      },

      // unaxis audit-npm
      // Verify every zone has a correct NPM proxy host — create or fix if not.
      // TUI equivalent: CoreView → Proxy → [audit-npm] action.
      "audit-npm": async (_args, onLine) => {
        const [all, envs] = await Promise.all([loadZones(), loadEnvironments()]);
        const envById = new Map(envs.map((e) => [e.id, e]));
        const deployable = all.filter((z: any) => z.key !== "unenter" && z.key !== "proxy");
        if (deployable.length === 0) { onLine("(no deployable zones)"); return 0; }
        let failed = 0;
        for (const z of deployable) {
          const zoneEnv = z.environmentId ? (envById.get(z.environmentId) ?? null) : null;
          onLine(`
── ${z.label}  (${z.domain}) ──`);
          const code = await npmAddZone(z, onLine, zoneEnv);
          if (code !== 0) failed++;
        }
        onLine(failed === 0
          ? `
✓ All ${deployable.length} NPM hosts verified`
          : `
⚠ ${failed} host${failed !== 1 ? "s" : ""} had errors`);
        return failed === 0 ? 0 : 1;
      },

      // unaxis host [--json]
      // Snapshot of host CPU / RAM / uptime. No deps on Docker or NPM.
      // TUI equivalent: CoreView perf NOC + useHostMonitor hook.
      host: async (args, onLine) => {
        if (args[0] === "doctor") {
          const report = await inspectDockerWslVhd();
          if (args.includes("--json")) {
            onLine(JSON.stringify(report));
          } else {
            for (const line of formatDockerWslVhdReport(report)) onLine(line);
          }
          return report.error ? 1 : 0;
        }
        const json = args.includes("--json");
        const os = await import("os");
        const cpus = os.cpus();
        let totalTick = 0, idleTick = 0;
        for (const cpu of cpus) {
          const vals = Object.values(cpu.times) as number[];
          totalTick += vals.reduce((a, b) => a + b, 0);
          idleTick  += cpu.times.idle;
        }
        const cpuPct   = parseFloat(((1 - idleTick / totalTick) * 100).toFixed(1));
        const memTotal = os.totalmem();
        const memFree  = os.freemem();
        const uptimeSec = Math.round(os.uptime());
        const payload = {
          cpuPct,
          cpuCount:   cpus.length,
          memTotalMb: Math.round(memTotal / 1024 / 1024),
          memUsedMb:  Math.round((memTotal - memFree) / 1024 / 1024),
          memFreeMb:  Math.round(memFree  / 1024 / 1024),
          uptimeSec,
          platform:   os.platform(),
          arch:       os.arch(),
        };
        if (json) { onLine(JSON.stringify(payload)); return 0; }
        onLine(`CPU    ${cpuPct}%  (${cpus.length} cores)`);
        onLine(`RAM    ${payload.memUsedMb} MB used / ${payload.memFreeMb} MB free / ${payload.memTotalMb} MB total`);
        onLine(`Uptime ${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m`);
        onLine(`OS     ${os.platform()}/${os.arch()}`);
        return 0;
      },

      // unaxis infra check [--json]
      // Run the full InfraPanel reachability suite against all known endpoints.
      // TUI equivalent: InfraPanel → [1] Hosts view → [R] check all.
      "infra": async (args, onLine) => {
        const sub  = args[0] ?? "check";
        const json = args.includes("--json");
        if (sub !== "check") { onLine("✗ usage: infra check [--json]"); return 2; }

        const envs   = await loadEnvironments();
        const active = envs.find((e: any) => e.active) ?? null;
        const svcs   = active ? buildInfraServices(active) : INFRA_SERVICES;

        onLine(`Checking ${svcs.length} endpoints…`);
        const results: { label: string; machine: string; status: string; ms: number | null }[] = [];
        for (const svc of svcs) {
          const r = await checkService(svc);
          results.push({ label: svc.label, machine: svc.machine, status: r.status, ms: r.ms ?? null });
          if (!json) {
            const icon = r.status === "up" ? "●" : r.status === "down" ? "✗" : "○";
            const ms   = r.ms != null ? `  ${r.ms}ms` : "";
            onLine(`  ${icon}  ${svc.label.padEnd(28)} ${r.status}${ms}`);
          }
        }

        if (json) { onLine(JSON.stringify({ ts: new Date().toISOString(), results })); return 0; }

        const up   = results.filter((r) => r.status === "up").length;
        const down = results.filter((r) => r.status === "down").length;
        onLine(`
${up}/${svcs.length} up${down > 0 ? `  ·  ${down} DOWN` : ""}`);
        return down > 0 ? 1 : 0;
      },

      // unaxis npm enable <id>   — re-enable a disabled NPM proxy host
      // unaxis npm disable <id>  — disable an NPM proxy host (keeps config)
      // TUI equivalent: NpmPanel → [space] toggle enable/disable.
      // These extend the existing npm handler (list/search/delete).

      // unaxis envs  — list all configured environments
      envs: async (_args, onLine) => {
        const all = await loadEnvironments();
        if (all.length === 0) { onLine("(no environments configured)"); return 0; }
        for (const e of all) {
          const activeMarker = e.active ? "●" : "○";
          const statusColor = e.status === "up" ? "up" : e.status === "down" ? "down" : "unk";
          onLine(
            `  ${activeMarker} ${e.name.padEnd(16)} ${statusColor.padEnd(5)} ${environmentTypeLabel(e.type).padEnd(14)} ${e.domain}`
          );
        }
        const activeEnv = all.find((e) => e.active);
        onLine(`✓ ${all.length} environment${all.length !== 1 ? "s" : ""}${activeEnv ? ` (active: ${activeEnv.name})` : ""}`);
        return 0;
      },

      // unaxis ping-envs  — ping /health on every registered environment's agent
      // Zero-keystroke equivalent of navigating to Environments → [p] on each node.
      // Returns name, agentUrl, version, online/offline for every environment.
      "ping-envs": async (_args, onLine) => {
        const all = await loadEnvironments();
        if (all.length === 0) { onLine("(no environments configured)"); return 0; }

        onLine(`Pinging ${all.length} environment${all.length !== 1 ? "s" : ""}…`);
        let failed = 0;

        for (const env of all) {
          if (!env.agentUrl) {
            onLine(`  ○ ${env.name.padEnd(16)} no agent configured`);
            continue;
          }

          onLine(`  … ${env.name.padEnd(16)} ${env.agentUrl}`);
          const result = await pingAgentHealth(env);
          await saveAgentStatus(env.id, result);

          if (result.online) {
            const version = result.version ? `v${result.version}` : "version unknown";
            onLine(`  ✓ ${env.name.padEnd(16)} online   ${version}   ${env.agentUrl}`);
          } else {
            failed++;
            const detail = result.detail ?? "unreachable";
            onLine(`  ✗ ${env.name.padEnd(16)} offline  ${detail}`);
          }
        }

        const passed = all.filter((e) => !!e.agentUrl).length - failed;
        onLine(`\n✓ ping-envs complete  —  ${passed} online, ${failed} failed`);
        return failed > 0 ? 1 : 0;
      },

      // unaxis env status|use|list  — inspect or switch active environment
      env: async (args, onLine) => {
        const sub = args[0] ?? "status";

        // ── Helpers local to the env handler ──────────────────────────────
        // Resolve an optional env-name arg, report errors, return null to bail.
        const resolveEnv = async (nameArg: string | undefined) => {
          const all = await loadEnvironments();
          const env = nameArg
            ? all.find((e) => e.name.toLowerCase() === nameArg.toLowerCase())
            : all.find((e) => e.isDefaultTarget) ?? all[0];
          if (!env) {
            onLine(nameArg ? `✗ environment not found: "${nameArg}"` : "✗ no environments configured");
            return null;
          }
          if (!env.agentUrl) { onLine(`✗ ${env.name} has no agent configured`); return null; }
          return env;
        };
        // Extract a positional name arg (skips flags like --json, --all).
        const nameAt = (a: string[], idx = 1): string | undefined =>
          a[idx] && !a[idx].startsWith("--") ? a[idx] : undefined;

        // unaxis env status  — show the active environment
        if (sub === "status") {
          const active = await getActiveEnvironment();
          if (!active) {
            onLine("✗ no active environment");
            onLine("  run: unaxis envs   to see all environments");
            return 1;
          }
          onLine(`✓ active environment: ${active.name}`);
          onLine(`  type      : ${environmentTypeLabel(active.type)}`);
          onLine(`  domain    : ${active.domain}`);
          onLine(`  npm       : ${active.npmHost}:${active.npmPort}`);
          onLine(`  proxy     : ${active.proxyHost}:${active.proxyPort}`);
          onLine(`  ddns      : ${active.ddnsHostname}`);
          onLine(`  public    : ${active.publicUrl}`);
          onLine(`  status    : ${active.status}`);
          if (active.npmSecretId) onLine(`  npm-secret : configured`);
          if (active.azureAppIdSecretId) onLine(`  azure-cred : configured`);
          return 0;
        }

        // unaxis env use <name>  — switch the active environment
        if (sub === "use") {
          const targetName = args[1];
          if (!targetName) {
            onLine("✗ usage: env use <environment-name>");
            return 2;
          }
          const all = await loadEnvironments();
          const target = all.find((e) => e.name === targetName);
          if (!target) {
            onLine(`✗ environment not found: "${targetName}"`);
            onLine(`  available: ${all.map((e) => e.name).join(", ")}`);
            return 1;
          }
          if (target.active) {
            onLine(`○ already active: ${target.name}`);
            return 0;
          }
          onLine(`• switching to environment: ${target.name}…`);
          const result = await setActiveEnvironment(target.id);
          if (!result) {
            onLine("✗ failed to switch environment — check TUI logs");
            return 1;
          }
          // Bust cache and push the new active env into TUI state immediately.
          refreshEnvsRef.current();
          onLine(`✓ switched to: ${result.name}`);
          onLine(`  type   : ${environmentTypeLabel(result.type)}`);
          onLine(`  domain : ${result.domain}`);
          onLine(`  proxy  : ${result.proxyHost}:${result.proxyPort}`);
          return 0;
        }

        // unaxis env list  — alias for unaxis envs
        if (sub === "list") {
          const all = await loadEnvironments();
          if (args.includes("--json")) {
            onLine(JSON.stringify(all, null, 2));
            return 0;
          }
          if (all.length === 0) { onLine("(no environments configured)"); return 0; }
          for (const e of all) {
            const marker = e.isDefaultTarget ? "● (default)" : "○";
            onLine(`  ${marker.padEnd(13)} ${e.name.padEnd(16)} ${environmentTypeLabel(e.type).padEnd(14)} ${e.domain}`);
          }
          return 0;
        }

        // unaxis env ping [<name>]
        // Ping one named environment, or all environments if no name given.
        if (sub === "ping") {
          const targetName = args[1];
          const all        = await loadEnvironments();
          if (all.length === 0) { onLine("(no environments configured)"); return 0; }

          const targets = targetName
            ? all.filter((e) => e.name.toLowerCase() === targetName.toLowerCase())
            : all;

          if (targets.length === 0) {
            onLine(`✗ environment not found: "${targetName}"`);
            onLine(`  available: ${all.map((e) => e.name).join(", ")}`);
            return 1;
          }

          let failed = 0;
          for (const env of targets) {
            if (!env.agentUrl) {
              onLine(`  ○ ${env.name.padEnd(16)} no agent configured`);
              continue;
            }
            const result = await pingAgentHealth(env);
            await saveAgentStatus(env.id, result);
            if (result.online) {
              const ver = result.version ? `v${result.version}` : "version unknown";
              onLine(`  ✓ ${env.name.padEnd(16)} online   ${ver}   ${env.agentUrl}`);
            } else {
              failed++;
              onLine(`  ✗ ${env.name.padEnd(16)} offline  ${result.detail ?? "unreachable"}`);
            }
          }
          const passed = targets.filter((e) => !!e.agentUrl).length - failed;
          onLine(`✓ ping complete  —  ${passed} online, ${failed} failed`);
          return failed > 0 ? 1 : 0;
        }

        // unaxis env health [<name>] [--json]
        // Deep state detection: host / agent / engine tiles per environment.
        // States: online · busy · sleeping (engine-off) · wedged · restarting
        //         · agent-down · offline · unknown
        if (sub === "health") {
          const targetName = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
          const all        = await loadEnvironments();
          if (all.length === 0) { onLine("(no environments configured)"); return 0; }

          const targets = targetName
            ? all.filter((e) => e.name.toLowerCase() === targetName.toLowerCase())
            : all;
          if (targets.length === 0) {
            onLine(`✗ environment not found: "${targetName}"`);
            onLine(`  available: ${all.map((e) => e.name).join(", ")}`);
            return 1;
          }

          onLine(`Probing ${targets.length} environment${targets.length !== 1 ? "s" : ""}…`);
          const results = await probeEnvironments(targets);

          if (args.includes("--json")) {
            const out = targets.map((e) => ({ name: e.name, ...results.get(e.id)! }));
            onLine(JSON.stringify(out, null, 2));
            return 0;
          }

          let unhealthy = 0;
          for (const env of targets) {
            const r    = results.get(env.id)!;
            const tile = probeStateTile(r.state);
            if (r.state !== "online" && r.state !== "busy") unhealthy++;

            const lat = r.engineLatencyMs != null ? ` ${r.engineLatencyMs}ms`
                      : r.agentLatencyMs  != null ? ` ${r.agentLatencyMs}ms` : "";
            onLine(`  ${tile.icon} ${env.name.padEnd(16)} ${tile.label.padEnd(11)}${lat}`);
            onLine(`      host ${r.host.padEnd(8)} agent ${r.agent.padEnd(8)} engine ${r.engine}`);
            onLine(`      ${r.detail}`);
          }
          onLine(`✓ health probe complete — ${targets.length - unhealthy} healthy, ${unhealthy} attention`);
          return unhealthy > 0 ? 4 : 0;
        }

        // unaxis env stacks [<name>]
        // Groups containers by com.docker.compose.project label — no extra agent
        // endpoint needed, derived from the same fetchContainers data.
        if (sub === "stacks") {
          const env = await resolveEnv(nameAt(args));
          if (!env) return 1;
          onLine(`Stacks on ${env.name} (${env.agentUrl})…`);
          const containers = await fetchContainers(env);
          if (!containers) { onLine(`✗ Could not reach agent — is ${env.name} online?`); return 1; }

          // Group by docker compose project label
          const stacks = new Map<string, { running: number; total: number; services: string[] }>();
          for (const c of containers) {
            const project = c.Labels?.["com.docker.compose.project"] ?? "(standalone)";
            const service = c.Labels?.["com.docker.compose.service"]
              ?? c.Names[0]?.replace(/^\//, "")
              ?? "?";
            if (!stacks.has(project)) stacks.set(project, { running: 0, total: 0, services: [] });
            const stack = stacks.get(project)!;
            stack.total++;
            if (c.State === "running") stack.running++;
            stack.services.push(service);
          }

          for (const [name, info] of [...stacks.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            const dot = info.running === info.total ? "●" : info.running > 0 ? "◐" : "○";
            const preview = info.services.slice(0, 5).join(", ") + (info.services.length > 5 ? "…" : "");
            onLine(`  ${dot} ${name.padEnd(32)} ${info.running}/${info.total}  ${preview}`);
          }
          onLine(`\n✓ ${stacks.size} stack${stacks.size !== 1 ? "s" : ""}  —  ${env.name}`);
          return 0;
        }

        // unaxis env logs <env-name> <container-name> [--tail <n>]
        // Fetch logs for any container on any environment via the agent pathway.
        if (sub === "logs") {
          const envName       = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
          const containerName = args[2] && !args[2].startsWith("--") ? args[2] : undefined;
          if (!envName || !containerName) {
            onLine("✗ usage: env logs <env-name> <container-name> [--tail <n>]");
            return 2;
          }
          const all    = await loadEnvironments();
          const target = all.find((e) => e.name.toLowerCase() === envName.toLowerCase());
          if (!target) { onLine(`✗ environment not found: "${envName}"`); return 1; }
          if (!target.agentUrl) { onLine(`✗ ${target.name} has no agent configured`); return 1; }
          const tail = parseTail(args.slice(3));
          onLine(`Logs  ${containerName}  on ${target.name}  tail ${tail}`);
          const text = await fetchContainerLogs(target, containerName, tail);
          if (text === null) {
            onLine(`✗ Could not fetch logs — is "${containerName}" running on ${target.name}?`);
            onLine(`  Tip: env containers ${envName} --all`);
            return 1;
          }
          text.split("\n").filter(Boolean).forEach(onLine);
          onLine(`\n✓ ${target.name} / ${containerName} logs (${tail} lines)`);
          return 0;
        }

        // unaxis env containers [<name>] [--all]
        // List containers on a named environment (or the default env).
        // By default shows only unt_* containers; --all shows everything.
        if (sub === "containers") {
          // Disambiguate: is the next arg an env name or a flag?
          const showAll    = args.includes("--all");
          const jsonOut    = args.includes("--json");
          const env = await resolveEnv(nameAt(args));
          if (!env) return 1;

          if (!jsonOut) onLine(`Fetching containers on ${env.name} (${env.agentUrl})…`);
          const containers = await fetchContainers(env);
          if (!containers) {
            onLine(`✗ Could not reach agent — is ${env.name} online?`);
            return 1;
          }

          let visible = showAll
            ? containers
            : containers.filter((c) => c.Names.some((n) => n.replace(/^\//, "").startsWith("unt_")));

          // --label k=v  → filter by an exact container label match (was ignored before)
          const labelIdx = args.indexOf("--label");
          if (labelIdx !== -1 && args[labelIdx + 1]) {
            const [lk, lv] = args[labelIdx + 1].split("=");
            visible = visible.filter((c) => {
              const lbls = (c.Labels ?? {}) as Record<string, string>;
              return lv === undefined ? lk in lbls : lbls[lk] === lv;
            });
          }

          if (jsonOut) {
            onLine(JSON.stringify({ env: env.name, ts: new Date().toISOString(), containers: visible }, null, 2));
            return 0;
          }

          if (visible.length === 0) {
            onLine(showAll ? "  (no containers)" : "  (no unt_* containers — try --all)");
            onLine(`✓ ${env.name}`);
            return 0;
          }

          for (const c of visible) {
            const dot   = c.State === "running" ? "●" : "○";
            const name  = c.Names[0]?.replace(/^\//, "") ?? c.Id.slice(0, 12);
            const state = c.State.padEnd(8);
            onLine(`  ${dot} ${name.padEnd(22)} ${state}  ${c.Image}`);
          }
          const running = visible.filter((c) => c.State === "running").length;
          onLine(`\n✓ ${visible.length} container${visible.length !== 1 ? "s" : ""}  (${running} running)  —  ${env.name}`);
          return 0;
        }

        // unaxis env images [<name>] [--json]
        // List Docker images on the target environment.
        // Reuses EnvPanel → ImagesView → fetchImages() — same call, straight to CLI.
        if (sub === "images") {
          // Targeted recovery for image tags left by an already-deleted zone.
          // Dry-run by default and restricted to UNAXIS-owned repositories.
          const removeRepoAt = args.indexOf("--remove-repo");
          if (removeRepoAt >= 0) {
            const repo = args[removeRepoAt + 1];
            const ownRepo = /(^|\/)(unenter|unaxis)(?:[-/]|$)/i;
            if (!repo || repo.startsWith("--") || !ownRepo.test(repo)) {
              onLine(`✗ --remove-repo requires an UNAXIS-owned repository name`);
              return 2;
            }

            const envArg = args.find(
              (arg, index) =>
                index > 0 &&
                index !== removeRepoAt + 1 &&
                !arg.startsWith("--"),
            );
            const env = await resolveEnv(envArg);
            if (!env) return 1;

            const images = await fetchImages(env);
            if (!images) {
              onLine(`✗ could not reach agent — is ${env.name} online?`);
              return 1;
            }

            const tags = [
              ...new Set(
                images.flatMap((item) =>
                  (item.RepoTags ?? []).filter((tag) =>
                    tag.startsWith(`${repo}:`),
                  ),
                ),
              ),
            ];
            if (tags.length === 0) {
              onLine(`✓ no local image tags found for ${repo} on ${env.name}`);
              return 0;
            }

            const doDelete = args.includes("--yes");
            onLine(
              `${doDelete ? "Removing" : "Would remove"} ${tags.length} local image tag${tags.length === 1 ? "" : "s"} for ${repo}:`,
            );
            for (const tag of tags) onLine(`  ${tag}`);
            if (!doDelete) {
              onLine(`\n  dry-run — re-run with --yes to remove these tags.`);
              return 0;
            }

            let removed = 0;
            for (const tag of tags) {
              if (await removeImage(env, tag)) removed++;
            }
            onLine(
              `\n✓ removed ${removed}/${tags.length} image tags from ${env.name}`,
            );
            return removed === tags.length ? 0 : 4;
          }

          // ── unaxis env images --prune-stale [<env>] [--yes] ───────────────
          // Ledger-aware image GC. DRY-RUN unless --yes. Keeps: images backing
          // running containers, every :latest, ledger-referenced images, and
          // the newest 2 dated tags per repo (rollback). Removes: dangling
          // <none> + older dated tags. Tagged images are removed by tag-ref
          // (untag-safe); dangling by id.
          if (args.includes("--prune-stale")) {
            const doDelete = args.includes("--yes");
            // env name = first non-flag positional after the "images" sub
            // (nameAt only reads args[1], which here is the --prune-stale flag).
            const envArg = args.find((a, i) => i > 0 && !a.startsWith("--"));
            const env = await resolveEnv(envArg);
            if (!env) return 1;

            const [images, containers] = await Promise.all([fetchImages(env), fetchContainers(env)]);
            if (!images) { onLine(`✗ could not reach agent — is ${env.name} online?`); return 1; }

            const keepIds  = new Set<string>();
            const keepTags = new Set<string>();
            for (const c of containers ?? []) { keepIds.add(c.ImageID); keepTags.add(c.Image); }
            try {
              const { dbGetLedger } = await import("../control-db.js");
              for (const e of dbGetLedger({ limit: 500 }) as Array<{ image?: string }>) if (e.image) keepTags.add(e.image);
            } catch { /* ledger optional */ }

            const KEEP_RECENT  = 2;
            const danglingOnly = args.includes("--dangling-only");
            // Tagged deletes are restricted to OUR published repos. Third-party
            // images (postgres, bun, supabase, …) are NEVER removed by tag — only
            // ever reclaimed if they go dangling. This is the "nothing bad" guard.
            const OWN = /(^|\/)(unenter|unaxis)/i;
            const sizeById = new Map(images.map((i) => [i.Id, i.Size]));
            const del: { label: string; target: string; size: number }[] = [];

            // dangling <none> → always reclaim (unless an id backs a running container)
            for (const img of images) {
              const tags = img.RepoTags ?? [];
              if ((tags.length === 0 || tags[0] === "<none>:<none>") && !keepIds.has(img.Id)) {
                del.push({ label: "<none>", target: img.Id, size: img.Size });
              }
            }
            // tagged tail → only OUR repos, keep newest KEEP_RECENT + protected
            if (!danglingOnly) {
              const byRepo = new Map<string, { tag: string; id: string; created: number }[]>();
              for (const img of images) {
                for (const t of img.RepoTags ?? []) {
                  if (t === "<none>:<none>") continue;
                  const repo = t.slice(0, t.lastIndexOf(":"));
                  (byRepo.get(repo) ?? byRepo.set(repo, []).get(repo)!).push({ tag: t, id: img.Id, created: img.Created });
                }
              }
              for (const [repo, list] of byRepo) {
                if (!OWN.test(repo)) continue;   // never delete third-party images by tag
                let kept = 0;
                for (const { tag, id } of list.sort((a, b) => b.created - a.created)) {
                  if (tag.endsWith(":latest") || keepTags.has(tag) || keepIds.has(id)) continue;
                  if (kept < KEEP_RECENT) { kept++; continue; }
                  del.push({ label: tag, target: tag, size: sizeById.get(id) ?? 0 });
                }
              }
            }

            const totalMb = del.reduce((s, d) => s + d.size, 0) / 1048576;
            if (del.length === 0) { onLine(`✓ nothing to prune on ${env.name} — already lean`); return 0; }
            onLine(`\n  prune-stale ${doDelete ? "(LIVE)" : "(dry-run)"}${danglingOnly ? " · dangling-only" : ""} — ${env.name}`);
            onLine(`  ${"─".repeat(56)}`);
            for (const d of del) onLine(`  ${(doDelete ? "rm" : "would rm").padEnd(8)} ${d.label.padEnd(46)} ${(d.size / 1048576).toFixed(0)}MB`);
            onLine(`  ─ ${del.length} images · ~${totalMb.toFixed(0)}MB reclaimable`);
            if (!doDelete) { onLine(`\n  dry-run — nothing deleted. Re-run with --yes to reclaim.`); return 0; }

            let okCount = 0, freed = 0;
            for (const d of del) if (await removeImage(env, d.target)) { okCount++; freed += d.size; }
            onLine(`\n✓ removed ${okCount}/${del.length} images · freed ~${(freed / 1048576).toFixed(0)}MB — ${env.name}`);
            return okCount === del.length ? 0 : 4;
          }

          const jsonOut = args.includes("--json");
          const env = await resolveEnv(nameAt(args));
          if (!env) return 1;

          onLine(`Fetching images on ${env.name} (${env.agentUrl})…`);
          const images = await fetchImages(env);
          if (!images) { onLine(`✗ could not reach agent — is ${env.name} online?`); return 1; }

          if (jsonOut) {
            onLine(JSON.stringify({ env: env.name, ts: new Date().toISOString(), images }));
            return 0;
          }
          for (const img of images) {
            const tag  = (img.RepoTags?.[0] ?? "<none>").padEnd(60);
            const size = img.Size ? `${Math.round(img.Size / 1024 / 1024)} MB` : "?";
            onLine(`  ${tag} ${size}`);
          }
          onLine(`
✓ ${images.length} image${images.length !== 1 ? "s" : ""}  —  ${env.name}`);
          return 0;
        }

        // unaxis env security [<name>] [--json]
        // Security posture audit for all containers on the target environment.
        // Calls inspectContainer() per container — reuses ContainerInspect path.
        // Reports: Privileged, User, CapAdd/CapDrop, SecurityOpt, writable mounts.
        if (sub === "security") {
          const jsonOut  = args.includes("--json");
          const targetEnv = await resolveEnv(nameAt(args));
          if (!targetEnv) return 1;

          onLine(`Auditing container security on ${targetEnv.name} (${targetEnv.agentUrl})…`);
          const containers = await fetchContainers(targetEnv);
          if (!containers) { onLine(`✗ could not reach agent — is ${targetEnv.name} online?`); return 1; }

          type ContainerSecurity = {
            id: string; name: string; image: string;
            privileged: boolean; user: string;
            capAdd: string[]; capDrop: string[]; securityOpt: string[];
            writableMounts: string[]; readonlyRootfs: boolean;
            restartPolicy: string; networkMode: string;
          };

          const results: ContainerSecurity[] = [];
          for (const c of containers) {
            const detail = await inspectContainer(targetEnv, c.Id as string);
            if (!detail) continue;

            const hc = (detail.HostConfig as Record<string, unknown>) ?? {};
            const writableMounts = ((detail.Mounts as {RW?: boolean; Destination?: string}[]) ?? [])
              .filter((m) => m.RW)
              .map((m) => m.Destination ?? "?");

            results.push({
              id:              (c.Id as string).slice(0, 12),
              name:            ((c.Names as string[])?.[0] ?? "?").replace(/^\//, ""),
              image:           (c.Image as string) ?? "?",
              privileged:      Boolean(hc.Privileged),
              user:            String(hc.UsernsMode ?? (detail.Config as Record<string,unknown>)?.User ?? ""),
              capAdd:          (hc.CapAdd as string[] | null) ?? [],
              capDrop:         (hc.CapDrop as string[] | null) ?? [],
              securityOpt:     (hc.SecurityOpt as string[] | null) ?? [],
              writableMounts,
              readonlyRootfs:  Boolean(hc.ReadonlyRootfs),
              restartPolicy:   String((hc.RestartPolicy as {Name?: string})?.Name ?? "no"),
              networkMode:     String(hc.NetworkMode ?? "?"),
            });
          }

          if (jsonOut) {
            onLine(JSON.stringify({ env: targetEnv.name, ts: new Date().toISOString(), containers: results }));
            return 0;
          }

          const risks   = results.filter((r) => r.privileged || r.capAdd.length > 0 || !r.readonlyRootfs);
          const clean   = results.filter((r) => !r.privileged && r.capAdd.length === 0 && r.readonlyRootfs);
          onLine(`\n  Security audit — ${targetEnv.name}  (${results.length} containers)`);
          onLine(`  ─────────────────────────────────────────────────────────`);
          for (const r of results) {
            const flag    = r.privileged ? "⚠ PRIVILEGED" : r.capAdd.length > 0 ? "⚠ CapAdd" : "✓";
            const rwfs    = r.readonlyRootfs ? "ro-root" : "rw-root";
            const restart = r.restartPolicy;
            onLine(`  ${flag.padEnd(14)} ${r.name.padEnd(40)} ${rwfs}  restart=${restart}`);
            if (r.capAdd.length)      onLine(`               CapAdd:      ${r.capAdd.join(", ")}`);
            if (r.capDrop.length)     onLine(`               CapDrop:     ${r.capDrop.join(", ")}`);
            if (r.securityOpt.length) onLine(`               SecOpt:      ${r.securityOpt.join(", ")}`);
            if (r.writableMounts.length) onLine(`               RW mounts:   ${r.writableMounts.join(", ")}`);
          }
          onLine(`\n  Summary: ${risks.length} flagged  ·  ${clean.length} clean`);
          return 0;
        }

        // unaxis env audit-image <image> [<env-name>] [--json]
        // Scan image layer history for secrets in RUN/ENV/COPY instructions.
        // Calls fetchImageHistory() → /images/<name>/history — new client function.
        if (sub === "audit-image") {
          const imageName = args[1];
          if (!imageName) {
            onLine("✗ usage: env audit-image <image> [<env-name>] [--json]");
            return 2;
          }
          const jsonOut   = args.includes("--json");
          const targetEnv = await resolveEnv(nameAt(args, 2));
          if (!targetEnv) return 1;

          onLine(`Fetching layer history for ${imageName} on ${targetEnv.name}…`);
          const layers = await fetchImageHistory(targetEnv, imageName);
          if (!layers) { onLine(`✗ image not found or agent unreachable: ${imageName}`); return 1; }

          // Secret patterns to flag in layer commands
          const SECRET_PATTERNS = [
            /password\s*=\s*\S+/i,
            /secret\s*=\s*\S+/i,
            /api[_\-]?key\s*=\s*\S+/i,
            /token\s*=\s*\S+/i,
            /private[_\-]?key/i,
            /aws[_\-]?access[_\-]?key/i,
            /aws[_\-]?secret/i,
            /-----BEGIN\s+\w+\s+PRIVATE KEY/i,
          ];

          type LayerAudit = {
            index: number; id: string; size: number; createdBy: string;
            flags: string[];
          };

          const audited: LayerAudit[] = layers.map((layer, i) => {
            const flags: string[] = [];
            const cmd = layer.CreatedBy ?? "";
            for (const pat of SECRET_PATTERNS) {
              if (pat.test(cmd)) flags.push(`secret-pattern:${pat.source.split("\\")[0]}`);
            }
            // Flag ENV instructions (common source of leaked secrets)
            if (/^\|?\d*\s*\/bin\/sh\s+-c\s+#\(nop\)\s+ENV\b/i.test(cmd)) flags.push("ENV-instruction");
            // Flag large ADD/COPY layers that could contain key material
            if (/^\|?\d*\s*\/bin\/sh\s+-c\s+#\(nop\)\s+(ADD|COPY)\b/i.test(cmd) && layer.Size > 10_000)
              flags.push("COPY/ADD-layer");
            return { index: i, id: layer.Id.slice(0, 12), size: layer.Size, createdBy: cmd, flags };
          });

          if (jsonOut) {
            onLine(JSON.stringify({ env: targetEnv.name, image: imageName, ts: new Date().toISOString(), layers: audited }));
            return 0;
          }

          const flagged = audited.filter((l) => l.flags.length > 0);
          onLine(`\n  Image layer audit — ${imageName}  (${layers.length} layers)`);
          onLine(`  ─────────────────────────────────────────────────────────`);
          for (const layer of audited) {
            const sizeMb  = (layer.size / 1024 / 1024).toFixed(1);
            const marker  = layer.flags.length ? "⚠" : "·";
            const preview = layer.createdBy.slice(0, 80).replace(/\s+/g, " ");
            onLine(`  ${marker} [${layer.index.toString().padStart(2)}] ${layer.id}  ${sizeMb.padStart(8)} MB  ${preview}`);
            for (const f of layer.flags) {
              onLine(`       ↳ ${f}`);
            }
          }
          onLine(`\n  ${flagged.length} layer${flagged.length !== 1 ? "s" : ""} flagged  ·  ${layers.length - flagged.length} clean`);
          if (flagged.length > 0) onLine(`  Tip: rebuild image without secret ENV vars; use Docker secrets or build args with --secret`);
          return 0;
        }

        // unaxis env events [<name>] [--since <duration>] [--json]
        // Fetch recent Docker events from the target environment.
        // Calls fetchDockerEvents() — new agent-client function.
        // <duration>: number of seconds back to look (default 3600 = 1 hour)
        if (sub === "events") {
          const jsonOut   = args.includes("--json");
          const sinceIdx  = args.indexOf("--since");
          const sinceSec  = sinceIdx !== -1 && args[sinceIdx + 1]
            ? parseInt(args[sinceIdx + 1] ?? "3600", 10)
            : 3600;
          const targetEnv = await resolveEnv(nameAt(args));
          if (!targetEnv) return 1;

          const until = Math.floor(Date.now() / 1000);
          const since = until - sinceSec;
          onLine(`Fetching Docker events on ${targetEnv.name} (last ${sinceSec}s)…`);
          const events = await fetchDockerEvents(targetEnv, since, until);
          if (!events) { onLine(`✗ could not reach agent — is ${targetEnv.name} online?`); return 1; }

          if (jsonOut) {
            onLine(JSON.stringify({ env: targetEnv.name, ts: new Date().toISOString(), since, until, events }));
            return 0;
          }

          if (events.length === 0) {
            onLine(`  No events in the last ${sinceSec}s on ${targetEnv.name}`);
            return 0;
          }

          onLine(`\n  Docker events — ${targetEnv.name}  (last ${sinceSec}s · ${events.length} events)`);
          onLine(`  ─────────────────────────────────────────────────────────`);
          for (const ev of events) {
            const ts   = new Date(ev.time * 1000).toISOString().slice(11, 19);
            const name = ev.Actor?.Attributes?.name ?? ev.Actor?.ID?.slice(0, 12) ?? "?";
            const img  = ev.Actor?.Attributes?.image ?? "";
            const tail = img ? `  [${img}]` : "";
            onLine(`  ${ts}  ${ev.Type.padEnd(10)} ${ev.Action.padEnd(12)} ${name}${tail}`);
          }
          return 0;
        }

        // unaxis env update <name>
        // Trigger a self-update on the named environment's agent.
        // The agent pulls the latest image, spawns the updater container,
        // and atomically replaces itself. Returns 202 immediately then dies —
        // poll with `unaxis env ping <name>` to confirm the new version is up.
        if (sub === "update") {
          const targetName = args[1];
          if (!targetName) {
            onLine("✗ usage: env update <environment-name>");
            return 2;
          }
          const all    = await loadEnvironments();
          const target = all.find((e) => e.name.toLowerCase() === targetName.toLowerCase());
          if (!target) {
            onLine(`✗ environment not found: "${targetName}"`);
            onLine(`  available: ${all.map((e) => e.name).join(", ")}`);
            return 1;
          }
          return updateRemoteAgent(target, onLine);
        }

        // unaxis env volumes [<name>] [--json]
        // List Docker volumes on the target environment.
        // Mirrors the VolumesView two-call dangling-filter pattern (Portainer model).
        if (sub === "volumes") {
          const jsonOut = args.includes("--json");
          const env = await resolveEnv(nameAt(args));
          if (!env) return 1;

          if (!jsonOut) onLine(`Fetching volumes on ${env.name} (${env.agentUrl})…`);
          const volumes = await fetchVolumes(env);
          if (!volumes) { onLine(`✗ could not reach agent — is ${env.name} online?`); return 1; }

          if (jsonOut) {
            onLine(JSON.stringify({ env: env.name, ts: new Date().toISOString(), volumes }, null, 2));
            return 0;
          }

          if (volumes.length === 0) {
            onLine(`  (no volumes)  —  ${env.name}`);
            return 0;
          }

          for (const v of volumes) {
            const dot    = v.dangling ? "○" : "●";
            const state  = (v.dangling ? "unused" : "in use").padEnd(7);
            const stack  = v.Labels?.["com.docker.compose.project"] ?? "—";
            onLine(`  ${dot} ${v.Name.padEnd(30)} ${state}  ${v.Driver.padEnd(8)}  ${stack}`);
          }
          const unused = volumes.filter((v) => v.dangling).length;
          onLine(`\n✓ ${volumes.length} volume${volumes.length !== 1 ? "s" : ""}  (${unused} unused)  —  ${env.name}`);
          return 0;
        }

        // unaxis env inspect <container> [<env>] [--json]
        // Surfaces a single container's unaxis.* imprint: labels, compose
        // project, image, state. Labels already arrive in /containers/json,
        // so no extra inspect round-trip is needed. Matches by exact name,
        // "unt_"-prefixed name, or Id prefix.
        if (sub === "inspect") {
          const jsonOut    = args.includes("--json");
          const positional = args.filter((a) => !a.startsWith("--"));
          // positional[0] is the subcommand token ("inspect")
          const target     = positional[1];
          if (!target) { onLine("  usage: env inspect <container> [<env>] [--json]"); return 2; }
          const env = await resolveEnv(positional[2]);
          if (!env) return 1;

          const containers = await fetchContainers(env);
          if (!containers) { onLine(`✗ could not reach agent — is ${env.name} online?`); return 1; }

          const match = containers.find((c) =>
            c.Names.some((n) => { const nm = n.replace(/^\//, ""); return nm === target || nm === `unt_${target}`; })
            || (c.Id as string).startsWith(target));
          if (!match) { onLine(`✗ container not found: "${target}" on ${env.name}`); return 1; }

          const labels  = (match.Labels ?? {}) as Record<string, string>;
          const name    = match.Names[0]?.replace(/^\//, "") ?? (match.Id as string).slice(0, 12);
          const project = labels["com.docker.compose.project"] ?? "(none)";
          const unaxis  = Object.entries(labels).filter(([k]) => k.startsWith("unaxis."));

          if (jsonOut) {
            onLine(JSON.stringify({ env: env.name, name, project, image: match.Image, state: match.State,
              unaxis: Object.fromEntries(unaxis), labels }, null, 2));
            return 0;
          }

          onLine(`\n  ${name}  ·  ${env.name}`);
          onLine(`  ─────────────────────────────────────────────`);
          onLine(`  state    : ${match.State}`);
          onLine(`  image    : ${match.Image}`);
          onLine(`  project  : ${project}`);
          if (unaxis.length === 0) {
            onLine(`  imprint  : ✗ NO unaxis.* labels — unstamped`);
          } else {
            onLine(`  imprint  : ✓ ${unaxis.length} unaxis.* label${unaxis.length !== 1 ? "s" : ""}`);
            for (const [k, v] of unaxis.sort(([a], [b]) => a.localeCompare(b))) onLine(`     ${k.padEnd(20)} ${v}`);
          }
          onLine(`✓ inspect`);
          return 0;
        }

        // unaxis env stats [<container>] [--json]
        // Live CPU/mem per container (Portainer delta formula). With a name,
        // just that one; otherwise every running unt_* container.
        if (sub === "stats") {
          const jsonOut    = args.includes("--json");
          const positional = args.filter((a) => !a.startsWith("--"));
          const target     = positional[1];
          const env = await resolveEnv(undefined);
          if (!env) return 1;
          const containers = await fetchContainers(env);
          if (!containers) { onLine(`✗ could not reach agent — is ${env.name} online?`); return 1; }
          const pick = target
            ? containers.filter((c) => c.Names.some((n) => { const nm = n.replace(/^\//, ""); return nm === target || nm === `unt_${target}`; }))
            : containers.filter((c) => c.State === "running" && c.Names.some((n) => n.replace(/^\//, "").startsWith("unt_")));
          if (pick.length === 0) { onLine(`✗ no matching container(s) for "${target ?? "unt_*"}"`); return 1; }
          const rows: { name: string; cpu: number; memMb: number; memPct: number }[] = [];
          for (const c of pick) {
            const s = await fetchContainerStats(env, c.Id as string);
            if (!s) continue;
            rows.push({ name: (c.Names[0] ?? "").replace(/^\//, ""), cpu: s.cpuPercent, memMb: s.memUsed / 1048576, memPct: s.memPercent });
          }
          if (jsonOut) { onLine(JSON.stringify({ env: env.name, ts: new Date().toISOString(), stats: rows })); return 0; }
          onLine(`\n  ${"container".padEnd(22)} ${"cpu%".padStart(7)} ${"mem".padStart(10)} ${"mem%".padStart(7)}`);
          onLine(`  ${"─".repeat(48)}`);
          for (const r of rows) onLine(`  ${r.name.padEnd(22)} ${r.cpu.toFixed(1).padStart(7)} ${(r.memMb.toFixed(0) + "MB").padStart(10)} ${r.memPct.toFixed(1).padStart(7)}`);
          onLine(`✓ ${rows.length} container${rows.length !== 1 ? "s" : ""}  —  ${env.name}`);
          return 0;
        }

        // unaxis env networks [<env>] [--json]
        if (sub === "networks") {
          const jsonOut = args.includes("--json");
          const env = await resolveEnv(nameAt(args));
          if (!env) return 1;
          onLine(`Fetching networks on ${env.name} (${env.agentUrl})…`);
          const nets = await fetchNetworks(env);
          if (!nets) { onLine(`✗ could not reach agent — is ${env.name} online?`); return 1; }
          if (jsonOut) { onLine(JSON.stringify({ env: env.name, networks: nets })); return 0; }
          for (const n of nets as Array<Record<string, unknown>>) {
            onLine(`  ${String(n.Name ?? "?").padEnd(28)} ${String(n.Driver ?? "?").padEnd(10)} ${String(n.Scope ?? "")}`);
          }
          onLine(`✓ ${(nets as unknown[]).length} networks  —  ${env.name}`);
          return 0;
        }

        // unaxis env <start|stop|restart> <container> [<env>]
        // Reversible lifecycle via the agent. Destructive removes (rm/prune)
        // are intentionally NOT exposed here — they require explicit human action.
        if (sub === "start" || sub === "stop" || sub === "restart") {
          const positional = args.filter((a) => !a.startsWith("--"));
          const target = positional[1];
          if (!target) { onLine(`  usage: env ${sub} <container> [<env>]`); return 2; }
          const env = await resolveEnv(positional[2]);
          if (!env) return 1;
          const containers = await fetchContainers(env);
          if (!containers) { onLine(`✗ could not reach agent — is ${env.name} online?`); return 1; }
          const match = containers.find((c) =>
            c.Names.some((n) => { const nm = n.replace(/^\//, ""); return nm === target || nm === `unt_${target}`; })
            || (c.Id as string).startsWith(target));
          if (!match) { onLine(`✗ container not found: "${target}" on ${env.name}`); return 1; }
          const cname = (match.Names[0] ?? "").replace(/^\//, "");
          onLine(`${sub === "restart" ? "Restarting" : sub === "stop" ? "Stopping" : "Starting"} ${cname} on ${env.name}…`);
          const ok = await containerAction(env, match.Id as string, sub as "start" | "stop" | "restart");
          if (!ok) { onLine(`✗ ${sub} failed for ${cname}`); return 1; }
          onLine(`✓ ${cname} — ${sub} ok`);
          return 0;
        }

        onLine(`✗ unknown env command: "${sub}"`);
        onLine("  usage: env list | env health [<name>] [--json] | env ping [<name>] | env containers [<name>] [--all] [--label k=v] | env images [<name>] | env volumes [<name>] | env networks [<name>] | env stacks [<name>] | env stats [<container>] | env inspect <container> [--json] | env start|stop|restart <container> | env logs <env> <container> [--tail <n>] | env update <name> | env status | env use <name> | env security [<name>] [--json] | env audit-image <image> [<env>] [--json] | env events [<name>] [--since <sec>] [--json]");
        return 2;
      },

      // unaxis session  — agent-friendly snapshot of the attached TUI
      session: async (args, onLine) => {
        const [all, activeEnv] = await Promise.all([loadZones(), getActiveEnvironment()]);
        const { view: currentView, bgOps: currentOps, proxyStatus: currentProxy } = ipcStateRef.current;
        const running = currentOps.filter((o) => o.busy && !o.dismissable).length;
        const live = currentOps.filter((o) => o.busy && o.dismissable).length;
        const done = currentOps.filter((o) => !o.busy).length;

        if (args.includes("--json")) {
          onLine(JSON.stringify({
            cwd: process.cwd(),
            env: activeEnv ? { name: activeEnv.name, type: activeEnv.type, domain: activeEnv.domain } : null,
            view: currentView,
            proxyStatus: currentProxy,
            zoneCount: all.length,
            stack: { running, live, done }
          }, null, 2));
          return 0;
        }

        onLine("✓ UNAXIS TUI is running");
        onLine(`  cwd    : ${process.cwd()}`);
        if (activeEnv) {
          onLine(`  env    : ${activeEnv.name} (${environmentTypeLabel(activeEnv.type)})`);
          onLine(`  domain : ${activeEnv.domain}`);
        }
        onLine(`  view   : ${currentView}`);
        onLine(`  proxy  : ${currentProxy}`);
        onLine(`  zones  : ${all.length}`);
        onLine(`  stack  : ${running} running, ${live} live, ${done} done`);
        return 0;
      },

      // unaxis stack  — compact list of visible TUI ops
      stack: async (args, onLine) => {
        // unaxis stack clear [<id>|--failed]
        // Remove FINISHED ops (done + failed) from the stack. Running/live
        // (dev/log-tail) ops are never yanked. Failed ops linger by design for
        // inspection, but a stale one gets in the way — this clears it without
        // needing the interactive [x]/DismissAll keys in the TUI.
        if (args[0] === "clear") {
          const arg2      = args[1];
          const targetId  = arg2 && !arg2.startsWith("--") ? arg2 : undefined;
          const failedOnly = args.includes("--failed");
          const ops = ipcStateRef.current.bgOps;

          const lastLine = (o: StackOp) => o.lines[o.lines.length - 1] ?? "";
          const isFailed = (o: StackOp) => /✗|exit [1-9]/.test(lastLine(o));

          const toRemove = ops.filter((o) => {
            if (o.busy || o.isLog) return false;        // never clear running/live ops
            if (targetId)   return String(o.id) === targetId;
            if (failedOnly) return isFailed(o);
            return true;                                 // all finished (done + failed)
          });

          if (toRemove.length === 0) {
            onLine(
              targetId   ? `no finished op #${targetId} to clear`
              : failedOnly ? "✓ no failed ops to clear"
              : "✓ nothing to clear — no finished ops",
            );
            return 0;
          }

          const removeIds = new Set(toRemove.map((o) => o.id));
          for (const o of toRemove) triggerDismissHookRef.current(o.id);
          setBgOpsRef.current((prev) => prev.filter((o) => !removeIds.has(o.id)));

          onLine(`✓ cleared ${toRemove.length} op${toRemove.length !== 1 ? "s" : ""}: ${[...removeIds].map((id) => `#${id}`).join(", ")}`);
          return 0;
        }

        const ops = ipcStateRef.current.bgOps;

        if (args.includes("--json")) {
          const { getOpQueue } = await import("../../utils/messageQueueManager.js");
          const queue = getOpQueue();
          onLine(JSON.stringify({ active: ops, queued: queue }, null, 2));
          return 0;
        }

        if (ops.length === 0) { onLine("✓ stack empty"); return 0; }
        for (const op of ops) {
          const state = op.busy ? (op.dismissable ? "live" : "running") : "done";
          const last = op.lines[op.lines.length - 1];
          onLine(`  #${op.id} ${state.padEnd(7)} ${op.title}${last ? ` · ${last}` : ""}`);
        }
        onLine(`✓ ${ops.length} stack item${ops.length !== 1 ? "s" : ""}`);
        return 0;
      },

      // unaxis stacks [--tail N]  — show ALL stack ops AND a tail of each one's
      // output in a single call. The aggregate view for watching several
      // backgrounded zone builds/deploys at once.
      stacks: async (args, onLine) => {
        const ops = ipcStateRef.current.bgOps;
        if (ops.length === 0) { onLine("✓ stacks empty"); return 0; }

        const tailN = Math.max(1, parseTail(args) || 6);
        for (const op of ops) {
          const state = op.busy ? (op.dismissable ? "live" : "running") : "done";
          onLine(`── #${op.id} [${state}] ${op.title} ──`);
          const tail = op.lines.slice(-tailN);
          if (tail.length === 0) onLine("   (no output yet)");
          else for (const l of tail) onLine(`   ${l}`);
          onLine("");
        }
        const running = ops.filter((o) => o.busy && !o.dismissable).length;
        const live    = ops.filter((o) => o.busy && o.dismissable).length;   // dev/log
        const done    = ops.filter((o) => !o.busy).length;
        onLine(`✓ ${ops.length} stack item${ops.length !== 1 ? "s" : ""} · ${running} running, ${live} live, ${done} done`);
        return 0;
      },

      // unaxis up — THE cold-start command. Brings the core compose stack
      // (db, kong, auth, rest, storage, app, proxy…) up from dead, waits for
      // db + kong health, then hydrates the local control DB from unenter.db
      // so zones/environments exist even on a fresh install. Exists because a
      // control plane that needs `docker compose up` typed by hand isn't one.
      // Idempotent: running services are untouched; hydration UPSERTs.
      up: async (args, onLine) => {
        return coldStartCoreStack(onLine, { skipHydrate: args.includes("--no-hydrate") });
      },

      // unaxis build-doctor [zone]  — diagnose why `next build` SSG hangs/OOMs.
      // Reports Docker's real memory, then probes every endpoint the build might
      // fetch FROM INSIDE the `unenter` network (same context as the build),
      // using the zone's own image + bun fetch with a 6s timeout so a hanging
      // fetch surfaces as TIMEOUT instead of stalling a 7-minute build.
      "build-doctor": async (args, onLine) => {
        const zoneName = args.find((a) => !a.startsWith("--")) ?? "unenter";
        const zone = await resolveZone(zoneName);
        if (!zone) { onLine(`✗ zone not found: "${zoneName}"`); return 1; }

        onLine(`Build doctor — ${zone.label} (${zone.image})`);

        // 1) Docker engine resources — the memory cap the build actually gets.
        onLine(`--- docker engine resources ---`);
        await dockerRun(["info", "--format", "memory={{.MemTotal}} cpus={{.NCPU}}"], onLine, 20000);

        // 2) Build-time reachability of every URL SSG might fetch, probed from a
        //    throwaway container on the unenter network using bun's fetch.
        const probes = [
          "http://kong:8000/rest/v1/",
          "http://kong:8000/auth/v1/health",
          "http://kong:8000/storage/v1/object/public/product-images/",
          "http://kong:8000/storage/v1/render/image/public/product-images/probe.webp",
          "https://db.unenter.live/rest/v1/",
          "https://www.unenter.live/",
          "https://dev.unenter.live/",
        ];
        const probeJs =
          `const us=${JSON.stringify(probes)};` +
          `for(const u of us){const t=Date.now();` +
          `try{const r=await fetch(u,{signal:AbortSignal.timeout(6000)});` +
          `console.log((r.ok?'OK ':'HTTP')+r.status+' '+(Date.now()-t)+'ms  '+u)}` +
          `catch(e){console.log('FAIL '+(Date.now()-t)+'ms  '+u+'  :: '+((e&&e.name)||e))}}`;

        onLine(`--- build-network reachability (container on "unenter") ---`);
        const probeCode = await dockerRun(
          ["run", "--rm", "--network", "unenter", zone.image, "bun", "-e", probeJs],
          onLine,
          80000,
        );
        onLine(probeCode === 0
          ? `✓ build-doctor complete — TIMEOUT/FAIL lines above are the build-time hang suspects`
          : `⚠ probe container exited ${probeCode} (image may lack bun/certs) — partial results above`);
        return probeCode === 0 ? 0 : 4;
      },

      // unaxis build-mem  — one snapshot of every container's memory usage AND
      // limit. Run repeatedly during a build to watch the buildx builder
      // (buildx_buildkit_*) climb: a hard cap below ~31GB → recreate builder
      // with more memory; usage climbing to the cap → SSG runaway (reduce SSG).
      // unaxis media <topology|facts|place|unplace|gateway|render|apply|edge|seed>
      // Which UNAXIS host does which media job — see media-topology.ts. Every
      // host-dependent media setting derives from these placements instead of
      // being typed into a file.
      // ── unaxis workspace status|init|sync|files ──────────────────────────
      // The workspace overlay: everything .gitignore leaves out (secrets, .env,
      // notes, state), versioned in its own repo that only lives on the forge.
      // ── unaxis secrets status|place|deploy|dump ───────────────────────────
      // The secrets manager (Infisical), placed on any UNAXIS host.
      secrets: async (args, onLine) => {
        const sm = await import("../secrets-manager-store.ts");
        const sub = args[0] ?? "status";
        if (sub === "status") return sm.secretsStatus(onLine);
        if (sub === "dump") return sm.dumpSecretsDb(onLine);

        if (sub === "use-for-builds") {
          const s = sm.getSecretsManager();
          const on = args[1] === "on" ? true : args[1] === "off" ? false : null;
          if (!s || on === null) { onLine("✗ usage: secrets use-for-builds on|off"); return 2; }
          sm.placeSecretsManager(s.env, { useForBuilds: on });
          onLine(on
            ? "✓ builds now take build args from the secrets manager (it wins over .env); off again with: secrets use-for-builds off"
            : "✓ builds use .env again; the secrets manager is only compared (shadow check)");
          return 0;
        }

        if (sub === "connect") {
          const projectId = args[1] && !args[1].startsWith("--") ? args[1] : null;
          const s = sm.getSecretsManager();
          if (!s) { onLine("✗ not placed — run: secrets place <env>"); return 1; }
          if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) { onLine("✗ usage: secrets connect <projectId> [--environment prod]"); return 2; }
          sm.placeSecretsManager(s.env, { projectId, environment: argValue(args, "--environment") ?? s.config.environment });
          onLine(`✓ connected to project ${projectId} (${argValue(args, "--environment") ?? s.config.environment}) — next: secrets check`);
          return 0;
        }

        // check: can UNAXIS log in and read? Compares KEY NAMES with .env — never prints values.
        if (sub === "check" || sub === "pull") {
          const { parseDotenv, diffKeys } = await import("../secrets-manager.ts");
          const { PROJECT_DIR } = await import("../../config/stack.ts");
          const { existsSync, readFileSync, writeFileSync, copyFileSync } = await import("fs");
          const { join, isAbsolute } = await import("path");
          let fetched;
          try { fetched = await sm.fetchSecrets(argValue(args, "--environment")); }
          catch (e) { onLine(`✗ ${e instanceof Error ? e.message : e}`); return 1; }
          onLine(`✓ read ${fetched.label} from the secrets manager`);
          const envPath = join(PROJECT_DIR, ".env");
          const local = existsSync(envPath) ? parseDotenv(readFileSync(envPath, "utf8")) : {};
          const d = diffKeys(local, fetched.values);
          onLine(`  in both, same value   ${Object.keys(local).length - d.onlyLocal.length - d.changed.length}`);
          onLine(`  in both, different    ${d.changed.length}${d.changed.length ? `: ${d.changed.join(", ")}` : ""}`);
          onLine(`  only in .env          ${d.onlyLocal.length}${d.onlyLocal.length ? `: ${d.onlyLocal.join(", ")}` : ""}`);
          onLine(`  only in the manager   ${d.onlyRemote.length}${d.onlyRemote.length ? `: ${d.onlyRemote.join(", ")}` : ""}`);
          if (sub === "check") return 0;

          // pull: write a .env-format file from the manager. Default target is a
          // new file; writing .env itself keeps a timestamped copy first.
          const out = argValue(args, "--out") ?? ".env.from-secrets";
          const outPath = isAbsolute(out) ? out : join(PROJECT_DIR, out);
          if (existsSync(outPath) && outPath === envPath) {
            const bak = `${envPath}.bak-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`;
            copyFileSync(envPath, bak);
            onLine(`  kept a copy of .env → ${bak}`);
          }
          const body = Object.keys(fetched.values).sort().map((k) => `${k}=${fetched.values[k]}`).join("\n") + "\n";
          writeFileSync(outPath, body, { mode: 0o600 });
          onLine(`✓ wrote ${Object.keys(fetched.values).length} values → ${outPath}`);
          return 0;
        }
        if (sub === "place") {
          const env = args[1] && !args[1].startsWith("--") ? findEnv(args[1]) : null;
          if (!env) { onLine("✗ usage: secrets place <env> [--http-port N] [--site-url <url>]"); return 2; }
          const patch: Record<string, any> = {};
          if (argValue(args, "--http-port")) patch.httpPort = Number(argValue(args, "--http-port"));
          if (argValue(args, "--site-url")) patch.siteUrl = argValue(args, "--site-url");
          onLine(`✓ placed ${sm.placeSecretsManager(env, patch)} — next: secrets deploy`);
          return 0;
        }
        if (sub === "deploy") {
          const runner = async (line: (value: string) => void) => {
            const code = await sm.deploySecretsManager(line);
            if (code === 0) {
              // Its keys + db dumps must ride the nightly backup.
              const bs = await import("../backup-store.ts");
              const cfg = bs.loadBackupConfig();
              if (!cfg.sources.some((x) => x.name === "unaxis-secrets")) {
                bs.saveBackupConfig({ ...cfg, sources: [...cfg.sources, { name: "unaxis-secrets", path: sm.SECRETS_MANAGER_DIR }] });
                line(`✓ added ${sm.SECRETS_MANAGER_DIR} to the nightly backup`);
              }
            }
            return code;
          };
          if (args.includes("--bg")) {
            runOpQueued("Deploy secrets manager", runner);
            onLine("⚡ Secrets manager deploy queued — watch: unaxis stacks");
            return 3;
          }
          return runOpVisible("Deploy secrets manager", runner, onLine);
        }
        onLine("✗ usage: secrets status | place <env> | deploy [--bg] | connect <projectId> | check | pull [--out <file>] | dump");
        return 2;
      },

      // ── unaxis changelog [<zone>|core|unaxis|services [<name>]] ──────────
      // One changelog per part of the platform, from commit messages and the
      // deploy ledger (see changelog.ts / changelog-scopes.ts).
      changelog: async (args, onLine) => {
        const cl = await import("../changelog.ts");
        const { dbGetZones } = await import("../control-db.ts");
        const pos = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--limit");
        const limitArg = Number(argValue(args, "--limit"));
        const json = args.includes("--json");
        const zones = dbGetZones().map((z) => z.key);
        const what = pos[0];

        if (!what) {
          // Overview: every zone's deploy state, then the shared scopes.
          onLine("unaxis changelog — one per zone, plus core, unaxis and services");
          onLine("");
          const rows: any[] = [];
          for (const key of zones) {
            const log = await cl.zoneChangelog(key, 1);
            const d = log.deploys[0];
            // Newer deploys without a commit make the count an upper bound.
            const ahead = log.unshipped === null ? "?" : `${log.unrecorded > 0 ? "≤" : ""}${log.unshipped.length}`;
            const last = (log.lastDeployAt ?? "").slice(0, 16) || "never";
            rows.push({ zone: key, lastDeployAt: log.lastDeployAt, deployed: d?.sourceRef ?? null, unrecorded: log.unrecorded, unshipped: d ? ahead : null });
            if (!json) onLine(`  ${key.padEnd(12)} last deploy ${last.padEnd(16)}  ${d ? `commit ${(log.unrecorded > 0 ? "?" : d.sourceRef).padEnd(18)} not deployed yet: ${ahead}` : "no deploy has recorded its commit yet"}`);
          }
          if (json) { onLine(JSON.stringify(rows, null, 2)); return 0; }
          onLine("");
          for (const kind of ["core", "unaxis", "services"] as const) {
            const [last] = await cl.scopeChangelog({ kind }, 1);
            onLine(`  ${kind.padEnd(12)} ${last ? `${last.date}  ${last.sha}  ${last.subject}` : "(no commits)"}`);
          }
          onLine("");
          onLine("  unaxis changelog <zone> | core | unaxis | services [<name>]   [--limit N] [--json]");
          return 0;
        }

        if (zones.includes(what)) {
          const log = await cl.zoneChangelog(what, limitArg > 0 ? limitArg : 10);
          if (json) { onLine(JSON.stringify(log, null, 2)); return 0; }
          onLine(`${what} — deploys and the commits each one shipped (zone source + core)`);
          onLine("");
          for (const l of cl.formatZoneChangelog(log)) onLine(l);
          return 0;
        }

        if (what === "core" || what === "unaxis" || what === "services") {
          const target: import("../changelog-scopes.ts").ChangelogTarget = what === "services" ? { kind: "services", name: pos[1] } : { kind: what };
          const commits = await cl.scopeChangelog(target, limitArg > 0 ? limitArg : 30);
          if (json) { onLine(JSON.stringify(commits, null, 2)); return 0; }
          const heading = {
            core:     "core — shared site code; ships in every zone image",
            unaxis:   "unaxis — the control plane (TUI, CLI, build/deploy tooling)",
            services: pos[1] ? `services — ${pos[1]}` : "services — workers, agents, proxy, media, Supabase, compose",
          }[what];
          onLine(heading);
          onLine("");
          if (commits.length === 0) onLine("  (no commits in recent history)");
          for (const l of cl.formatByDay(commits)) onLine(l);
          return 0;
        }

        onLine(`✗ unknown changelog "${what}" — zones: ${zones.join(", ")}; or core | unaxis | services [<name>]`);
        return 2;
      },

      // ── unaxis backup status|run|snapshots|source|target|schedule ─────────
      // restic snapshots of the dev drive to several targets (see backup.ts).
      backup: async (args, onLine) => {
        const store = await import("../backup-store.ts");
        const { validName } = await import("../backup.ts");
        const sub = args[0] ?? "status";
        const pos = args.filter((a, i) => i > 0 && !a.startsWith("--") && !["--dir", "--env", "--port"].includes(args[i - 1]));
        if (sub === "status") return store.backupStatus(onLine);
        if (sub === "run") {
          const runner = (line: (value: string) => void) => store.runBackup(line, pos[0]);
          if (args.includes("--bg")) {
            runOpQueued("Backup (restic)", runner);
            onLine("⚡ Backup queued — watch: unaxis stacks");
            return 3;
          }
          return runOpVisible("Backup (restic)", runner, onLine);
        }
        if (sub === "snapshots") return store.listSnapshots(onLine, pos[0]);

        if (sub === "source" || sub === "target") {
          const [action, name, path] = pos;
          const cfg = store.loadBackupConfig();
          if (action === "remove" && name) {
            if (sub === "source") cfg.sources = cfg.sources.filter((s) => s.name !== name);
            else cfg.targets = cfg.targets.filter((t) => t.name !== name);
            store.saveBackupConfig(cfg);
            onLine(`✓ removed ${sub} ${name}`);
            return 0;
          }
          if (action !== "add" || !name || !validName(name)) {
            onLine(sub === "source"
              ? "✗ usage: backup source add <name> <path> | remove <name>   (name: a-z 0-9 -)"
              : "✗ usage: backup target add <name> --dir <path> | --env <ENV> [--port N] | remove <name>");
            return 2;
          }
          if (sub === "source") {
            if (!path) { onLine("✗ give the folder to back up"); return 2; }
            cfg.sources = [...cfg.sources.filter((s) => s.name !== name), { name, path }];
          } else {
            const dir = argValue(args, "--dir");
            const envName = argValue(args, "--env");
            if (envName) {
              const port = Number(argValue(args, "--port") ?? 8010);
              const code = await store.deployRestServer(envName, onLine, port);
              if (code !== 0) return code;
              cfg.targets = [...cfg.targets.filter((t) => t.name !== name), { name, kind: "env", env: envName, port }];
            } else if (dir) {
              cfg.targets = [...cfg.targets.filter((t) => t.name !== name), { name, kind: "dir", path: dir }];
            } else { onLine("✗ target needs --dir <path> or --env <ENV>"); return 2; }
          }
          store.saveBackupConfig(cfg);
          onLine(`✓ ${sub} ${name} saved`);
          return 0;
        }

        if (sub === "schedule") {
          const when = pos[0];
          if (!when || !(when === "off" || /^\d{1,2}:\d{2}$/.test(when))) { onLine("✗ usage: backup schedule HH:MM | off"); return 2; }
          store.saveBackupConfig({ ...store.loadBackupConfig(), schedule: when === "off" ? null : when });
          onLine(`✓ nightly backup ${when === "off" ? "off" : `at ${when}`}`);
          return 0;
        }

        onLine("✗ usage: backup status | run [target] | snapshots [target] | source add|remove | target add|remove | schedule HH:MM|off");
        return 2;
      },

      workspace: async (args, onLine) => {
        const { initOverlay, overlayStatus, syncOverlay } = await import("../workspace-sync.ts");
        const { selectOverlayFiles } = await import("../workspace-overlay.ts");
        const { PROJECT_DIR } = await import("../../config/stack.ts");
        const root = argValue(args, "--dir") ?? PROJECT_DIR;
        const sub = args[0] ?? "status";
        if (sub === "status") return overlayStatus(root, onLine);
        if (sub === "init") {
          const remote = argValue(args, "--remote");
          if (!remote) { onLine("✗ usage: workspace init --remote <forge ssh url> [--dir <project>]"); return 2; }
          return initOverlay(root, remote, onLine);
        }
        if (sub === "sync") {
          return syncOverlay(root, onLine, { push: !args.includes("--no-push"), message: argValue(args, "--message") });
        }
        if (sub === "files") {
          const { files, tooBig, nestedRepos } = await selectOverlayFiles(root);
          files.forEach((f) => onLine(f));
          tooBig.forEach((b) => onLine(`(skipped, ${(b.bytes / 1e6).toFixed(0)} MB) ${b.path}`));
          nestedRepos.forEach((r) => onLine(`(skipped, nested git repo) ${r}/`));
          onLine(`✓ ${files.length} file(s) would be in the overlay`);
          return 0;
        }
        onLine("✗ usage: workspace status | init --remote <url> | sync [--no-push] [--message <m>] | files   [--dir <project>]");
        return 2;
      },

      // ── unaxis forge status|place|deploy|backup|backup-target|set ─────────
      // The self-hosted git forge (Forgejo), placed on any UNAXIS host.
      forge: async (args, onLine) => {
        const { backupForge, deployForge, forgeStatus, getForge, patchForge, placeForge } = await import("../forge-store.ts");
        const { formatBackupTarget, parseBackupTarget } = await import("../forge.ts");
        const sub = args[0] ?? "status";
        const flag = (name: string) => argValue(args, name);
        const settable: Record<string, string> = {
          "--root-url": "rootUrl", "--http-port": "httpPort", "--ssh-port": "sshPort", "--image": "image",
          "--keep-in-volume": "keepInVolume", "--keep-per-dir": "keepPerDir",
        };
        const patchFromFlags = () => {
          const patch: Record<string, any> = {};
          for (const [f, k] of Object.entries(settable)) {
            const v = flag(f);
            if (v !== undefined) patch[k] = /Port$|^keep/.test(k) ? Number(v) : v;
          }
          return patch;
        };

        if (sub === "status") return forgeStatus(onLine);

        if (sub === "place") {
          const env = args[1] && !args[1].startsWith("--") ? findEnv(args[1]) : null;
          if (!env) { onLine("✗ usage: forge place <env> [--root-url <url>] [--http-port N] [--ssh-port N]"); return 2; }
          const key = placeForge(env, patchFromFlags());
          onLine(`✓ placed ${key} — next: forge deploy`);
          return 0;
        }

        if (sub === "set") {
          const patch = patchFromFlags();
          if (!Object.keys(patch).length) { onLine(`✗ usage: forge set ${Object.keys(settable).join(" | ")} <value>`); return 2; }
          if (!patchForge(patch)) { onLine("✗ no forge placed"); return 1; }
          onLine(`✓ updated ${Object.keys(patch).join(", ")} — run forge deploy to apply`);
          return 0;
        }

        if (sub === "deploy") return deployForge(onLine);
        if (sub === "backup") return backupForge(onLine);

        if (sub === "backup-target") {
          const f = getForge();
          if (!f) { onLine("✗ no forge placed"); return 1; }
          const [action, raw] = [args[1], args.slice(2).join(" ")];
          let targets = f.config.backupTargets;
          if (action === "list" || !action) {
            targets.forEach((t) => onLine(t));
            if (!targets.length) onLine("(none)");
            return 0;
          }
          if (!raw || !["add", "remove"].includes(action)) {
            onLine("✗ usage: forge backup-target list | add <dir | env:NAME> | remove <dir | env:NAME>");
            return 2;
          }
          const t = parseBackupTarget(raw);
          if (typeof t === "string") { onLine(`✗ ${t}`); return 2; }
          if (t.kind === "env" && !findEnv(t.env)) { onLine(`✗ environment not found: ${t.env}`); return 1; }
          const value = formatBackupTarget(t);
          targets = action === "add" ? [...new Set([...targets, value])] : targets.filter((x) => x !== value);
          patchForge({ backupTargets: targets });
          onLine(`✓ backup targets: ${targets.join(", ") || "(none)"}`);
          return 0;
        }

        onLine("✗ usage: forge status | place <env> | set <flags> | deploy | backup | backup-target list|add|remove <dir | env:NAME>");
        return 2;
      },

      media: async (args, onLine) => {
        const sub = args[0] ?? "topology";
        // Positionals after the subcommand, skipping flags and the values of
        // flags that take one.
        const valueFlags = new Set(["--lan-ip", "--tailnet-ip", "--public-ip", "--uplink", "--gateway", "--key", "--config", "--forwards"]);
        const pos = args.filter((a, i) => i > 0 && !a.startsWith("--") && !valueFlags.has(args[i - 1]));
        const flag = (name: string) => argValue(args, name);

        if (sub === "topology") {
          const t = loadTopology();
          if (args.includes("--json")) { onLine(JSON.stringify(t, null, 2)); return 0; }
          for (const line of formatTopology(t)) onLine(line);
          return 0;
        }

        if (sub === "facts") {
          const target = pos[0];
          const envs = target ? [findEnv(target)].filter(Boolean) as NonNullable<ReturnType<typeof findEnv>>[] : (await loadEnvironments());
          if (!envs.length) { onLine(`✗ environment not found: ${target}`); return 1; }
          for (const env of envs) {
            if (args.includes("--discover") || !target) {
              const facts = await discoverHostFacts(env, onLine);
              onLine(`✓ ${env.name}: ${JSON.stringify(facts)}`);
            }
            const patch: Record<string, any> = {};
            const num = (v?: string) => (v == null ? undefined : Number(v));
            if (flag("--lan-ip")) patch.lanIp = flag("--lan-ip");
            if (flag("--tailnet-ip")) patch.tailnetIp = flag("--tailnet-ip");
            if (flag("--public-ip")) patch.publicIp = flag("--public-ip");
            if (flag("--uplink")) patch.uplinkMbps = num(flag("--uplink"));
            if (flag("--gateway")) patch.gateway = flag("--gateway") === "none" ? null : flag("--gateway");
            if (Object.keys(patch).length) onLine(`✓ ${env.name}: ${JSON.stringify(dbPatchHostFacts(env.id, patch))}`);
          }
          return 0;
        }

        if (sub === "place") {
          const [role, envName] = pos;
          if (!role || !isMediaRole(role) || !envName) {
            onLine(`usage: unaxis media place <${MEDIA_ROLES.join("|")}> <env> [--primary] [--public-whep] [--key k] [--config '{json}']`);
            return 2;
          }
          const env = findEnv(envName);
          if (!env) { onLine(`✗ environment not found: ${envName}`); return 1; }
          let config: Record<string, any> = {};
          try { config = flag("--config") ? JSON.parse(flag("--config")!) : {}; } catch { onLine("✗ --config must be JSON"); return 2; }
          if (args.includes("--primary")) config.primary = true;
          if (args.includes("--public-whep")) config.publicWhep = true;
          const key = placeRole(role, env, config, flag("--key"));
          onLine(`✓ placed ${key}`);
          return 0;
        }

        if (sub === "unplace") {
          const key = pos[0];
          if (!key) { onLine("usage: unaxis media unplace <key>"); return 2; }
          return unplaceRole(key) ? (onLine(`✓ removed ${key}`), 0) : (onLine(`✗ no media role "${key}"`), 1);
        }

        if (sub === "gateway") {
          const key = pos[0];
          const publicIp = flag("--public-ip");
          if (!key || !publicIp) {
            onLine(`usage: unaxis media gateway <key> --public-ip <ip> [--forwards '[{"external":"3478","internal":"3478","targetIp":"…","protocol":"BOTH"}]']`);
            return 2;
          }
          let forwards: PortForward[] | undefined;
          try { forwards = flag("--forwards") ? JSON.parse(flag("--forwards")!) : undefined; } catch { onLine("✗ --forwards must be JSON"); return 2; }
          setGateway(key, publicIp, forwards);
          onLine(`✓ gateway ${key} (${publicIp})${forwards ? `, ${forwards.length} forwards recorded` : ""}`);
          return 0;
        }

        if (sub === "render" || sub === "apply") {
          const t = loadTopology();
          const derived = renderDerivedConfig(t);
          for (const n of derived.notes) onLine(`⚠ ${n}`);
          const drift = computeDrift(derived);
          for (const d of drift) {
            const same = d.current === d.derived;
            onLine(`${same ? "✓" : "≠"} ${d.target.padEnd(8)} ${d.field.padEnd(26)} ${same ? d.current : `${d.current ?? "(unset)"} → ${d.derived ?? "(can't derive)"}`}`);
          }
          if (sub === "render") return drift.every((d) => d.current === d.derived) ? 0 : 4;
          const valid: ApplyTarget[] = ["routes", "coturn", "mediamtx", "env"];
          const wanted = pos.length ? pos.filter((p): p is ApplyTarget => (valid as string[]).includes(p)) : valid;
          if (args.includes("--dry-run")) { onLine("(dry run — nothing written)"); return 0; }
          const { changed, followUp } = applyDerived(derived, wanted, onLine);
          if (!changed.length) onLine("✓ nothing to apply — files already match the topology");
          for (const f of followUp) onLine(`→ ${f}`);
          return 0;
        }

        if (sub === "edge") {
          const action = pos[0];
          const key = pos[1];
          if (!key || (action !== "render" && action !== "deploy")) { onLine("usage: unaxis media edge <render|deploy> <placement-key>"); return 2; }
          if (action === "render") {
            try { for (const l of renderEdgeConfig(loadTopology(), key).split("\n")) onLine(l); return 0; }
            catch (error) { onLine(`✗ ${error instanceof Error ? error.message : error}`); return 1; }
          }
          return deployEdge(key, onLine);
        }

        if (sub === "seed") {
          onLine("• recording the roles running today (by container, on every environment)…");
          await seedFromLive(onLine);
          return 0;
        }

        onLine("usage: unaxis media <topology|facts|place|unplace|gateway|render|apply|edge|seed>");
        return 2;
      },

      "build-mem": async (_args, onLine) => {
        onLine(`mem @ ${new Date().toLocaleTimeString()}`);
        return dockerRun(["stats", "--no-stream", "--format", "{{.Name}}  {{.MemUsage}}  ({{.MemPerc}})"], onLine);
      },

      // unaxis builder-reset  — remove the unaxis-net buildx builder (e.g. after
      // it OOM-died mid-build and left a build hung). The next zone build
      // recreates it. Unsticks a zombie build holding a dead builder.
      "builder-reset": async (_args, onLine) => {
        onLine(`Removing buildx builder "unaxis-net"…`);
        await dockerRun(["buildx", "rm", "--force", "unaxis-net"], onLine);
        // The buildx builder entry and its buildkitd container are separate;
        // an OOM-died builder leaves a stale container that blocks recreation
        // ("context deadline exceeded"). Force-remove the container too.
        onLine(`Removing stale buildkitd container…`);
        await dockerRun(["rm", "-f", "buildx_buildkit_unaxis-net0"], onLine);
        onLine(`✓ builder + container removed — next build recreates it clean`);
        return 0;
      },

      // unaxis watch begin|status|note|snapshot|end
      watch: async (args, onLine) => {
        const sub = args[0] ?? "status";

        if (sub === "begin") {
          const label = (argValue(args, "--label") ?? args.slice(1).filter((a) => !a.startsWith("--")).join(" ")) || "agent session";
          const mode = validMode(argValue(args, "--mode")) ?? (args.includes("--db-backup") ? "risky" : "light");
          const zone = argValue(args, "--zone");
          const session = beginWatch({ label, mode, zone });
          const snapshot = await takeSessionSnapshot("watch begin");
          writeWatchText(session, "preflight.txt", snapshot);
          onLine(`✓ watch started: ${session.id}`);
          onLine(`  label : ${session.label}`);
          onLine(`  mode  : ${session.mode}`);
          if (session.zone) onLine(`  zone  : ${session.zone}`);
          onLine(`  dir   : ${session.dir}`);

          if (args.includes("--db-backup")) {
            onLine("• DB backup requested by watch begin");
            appendTimeline(session, "db.backup.start", { reason: "watch begin" });
            const lines: string[] = [];
            const code = await backupDatabase((line) => {
              lines.push(line);
              onLine(line);
            });
            appendWatchText(session, "backups.txt", lines.join("\n") + "\n");
            appendTimeline(session, "db.backup.end", { exitCode: code });
            if (code !== 0) return code;
          }
          return 0;
        }

        if (sub === "status") {
          const session = getActiveWatch();
          if (!session) {
            onLine(`○ no active watch`);
            onLine(`  root: ${watchRoot()}`);
            return 0;
          }
          onLine(`✓ watch active: ${session.id}`);
          onLine(`  label : ${session.label}`);
          onLine(`  mode  : ${session.mode}`);
          if (session.zone) onLine(`  zone  : ${session.zone}`);
          onLine(`  dir   : ${session.dir}`);
          return 0;
        }

        if (sub === "note") {
          const message = args.slice(1).join(" ").trim();
          if (!message) { onLine("✗ usage: watch note <message>"); return 2; }
          const session = noteWatch(message);
          if (!session) { onLine("✗ no active watch"); return 1; }
          onLine(`✓ note recorded: ${message}`);
          return 0;
        }

        if (sub === "snapshot") {
          const session = getActiveWatch();
          if (!session) { onLine("✗ no active watch"); return 1; }
          const reason = (argValue(args, "--reason") ?? args.slice(1).filter((a) => !a.startsWith("--")).join(" ")) || "manual snapshot";
          const text = await takeSessionSnapshot(reason);
          const filename = `snapshot-${Date.now()}.txt`;
          writeWatchText(session, filename, text);
          appendTimeline(session, "snapshot", { reason, file: filename });
          onLine(`✓ snapshot recorded: ${filename}`);
          return 0;
        }

        if (sub === "end") {
          const session = endWatch();
          if (!session) { onLine("○ no active watch"); return 0; }
          onLine(`✓ watch ended: ${session.id}`);
          onLine(`  dir: ${session.dir}`);
          return 0;
        }

        onLine(`✗ unknown watch command: ${sub}`);
        onLine("  usage: watch begin|status|note|snapshot|end");
        return 2;
      },

      // unaxis codev <sub> [args…]
      //
      // Subcommands:
      //   init [--slug <name>]  — provision a local-only Supabase instance
      //                           (no NPM, no DNS, own fresh keys) seeded
      //                           with Tank sample data, for an external
      //                           contributor's own machine. See
      //                           provisionCodevDatabase() for why this
      //                           can't reuse createBlankDatabase/db provision.
      codev: async (args, onLine) => {
        const sub = args[0];

        if (sub === "init") {
          const slug = argValue(args, "--slug") ?? "codev";
          try {
            const result = await provisionCodevDatabase(slug, onLine);
            onLine("");
            onLine("Add these to your .env (or .env.local) before `bun run dev`:");
            onLine(`  NEXT_PUBLIC_SUPABASE_URL=${result.apiUrl}`);
            onLine(`  NEXT_PUBLIC_SUPABASE_URL_BROWSER=${result.apiUrl}`);
            onLine(`  NEXT_PUBLIC_SUPABASE_ANON_KEY=${result.instance.secrets.anonKey}`);
            onLine(`  SUPABASE_SERVICE_ROLE_KEY=${result.instance.secrets.serviceRoleKey}`);
            onLine("");
            onLine(`Studio (browse/edit data): ${result.studioUrl}`);
            if (result.migrationErrors.length > 0) {
              onLine("");
              onLine(`⚠ ${result.migrationErrors.length} SQL file(s) failed to apply — instance still usable, but some tables/data may be missing:`);
              for (const e of result.migrationErrors.slice(0, 10)) onLine(`  ${e}`);
            }
            return result.migrationErrors.length > 0 ? 4 : 0;
          } catch (e) {
            onLine(`✗ codev init failed: ${e instanceof Error ? e.message : String(e)}`);
            return 1;
          }
        }

        onLine(`✗ unknown codev command: "${sub}"`);
        onLine("  usage: codev init [--slug <name>]");
        return 2;
      },

      // unaxis db <sub> [args…]
      //
      // Subcommands:
      //   backup [--reason <text>]                 — pg_dump into core backup dir
      //   logs [--tail <n>]                        — stream unt_db container logs
      //   snapshot [--slug <slug>]                 — full snapshot bundle + compress
      //   restore --bundle <path>                  — restore an instance from bundle
      //   snapshots [--slug <slug>]                — list snapshot bundles for instance
      //   template-capture [--force]               — capture fresh vanilla template
      //   templates                                — list available templates
      //   provision <slug> --kong <n> --studio <n> --pg <n> --ssl <n> --dir <path>
      //                                            — full provision: clone + proxy + NPM + MCP
      db: async (args, onLine) => {
        const sub = args[0];

        // ── db logs ──────────────────────────────────────────────────────────
        if (sub === "logs") {
          const tail = parseTail(args);
          const result = await captureDockerLogs({
            label: "db",
            container: "unt_db",
            tail,
          }, onLine);
          if (result.code === 0) onLine(`✓ db logs (${result.tail} lines)`);
          return result.code;
        }

        // ── db backup ────────────────────────────────────────────────────────
        if (sub === "backup") {
          const reason = argValue(args, "--reason") ?? "manual CLI backup";
          const session = getActiveWatch();
          if (session) appendTimeline(session, "db.backup.start", { reason });
          const lines: string[] = [];
          const code = await backupDatabase((line) => {
            lines.push(line);
            onLine(line);
          });
          if (session) {
            appendWatchText(session, "backups.txt", `# ${new Date().toISOString()} ${reason}\n${lines.join("\n")}\n`);
            appendTimeline(session, "db.backup.end", { reason, exitCode: code });
          }
          return code;
        }

        // ── db snapshot [--slug <slug>] ───────────────────────────────────────
        if (sub === "snapshot") {
          const targetSlug = argValue(args, "--slug");
          const registry   = await loadRegistry();
          const inst: RuntimeInstance | undefined =
            targetSlug
              ? (registry.find((i) => i.slug === targetSlug) ?? coreDockerInstance)
              : coreDockerInstance;

          if (!inst) { onLine(`✗ no instance with slug "${targetSlug}"`); return 1; }
          await snapshotInstance(inst, onLine);
          return 0;
        }

        // ── db snapshots [--slug <slug>] ──────────────────────────────────────
        if (sub === "snapshots") {
          const targetSlug = argValue(args, "--slug");
          const registry   = await loadRegistry();
          const inst: RuntimeInstance =
            (targetSlug ? registry.find((i) => i.slug === targetSlug) : undefined) ?? coreDockerInstance;

          const bundles = await listSnapshots(inst);
          if (bundles.length === 0) {
            onLine(`  (no snapshots for ${inst.slug})`);
            return 0;
          }
          for (const b of bundles) {
            const archTag = b.archivePath ? " ✓ .tar.gz" : "";
            onLine(`  ${b.id}  ${new Date(b.createdAt).toLocaleString()}${archTag}`);
          }
          onLine(`✓ ${bundles.length} snapshot${bundles.length !== 1 ? "s" : ""} for ${inst.slug}`);
          return 0;
        }

        // ── db restore --bundle <path> ────────────────────────────────────────
        if (sub === "restore") {
          const bundlePath = argValue(args, "--bundle");
          if (!bundlePath) { onLine("✗ usage: db restore --bundle <path-to-bundle-dir>"); return 1; }
          return await restoreInstance(bundlePath, onLine);
        }

        // ── db template-capture [--force] ─────────────────────────────────────
        if (sub === "template-capture") {
          const force     = args.includes("--force");
          const maxAge    = force ? 0 : 30;
          const template  = await captureTemplate(onLine, maxAge);
          onLine(`\n✓ Template ready: ${template.archivePath}`);
          return 0;
        }

        // ── db templates ──────────────────────────────────────────────────────
        if (sub === "templates") {
          const templates = await listTemplates();
          if (templates.length === 0) {
            onLine("  (no templates — run: db template-capture)");
            return 0;
          }
          for (const t of templates) {
            const ageDays = ((Date.now() - new Date(t.createdAt).getTime()) / 86_400_000).toFixed(0);
            onLine(`  fresh-${t.version}.tar.gz  (${ageDays}d old)  →  ${t.archivePath}`);
          }
          onLine(`✓ ${templates.length} template${templates.length !== 1 ? "s" : ""}`);
          return 0;
        }

        // ── db provision <slug> ───────────────────────────────────────────────
        // Usage: db provision <slug> --kong <n> --studio <n> --pg <n> --ssl <n> --dir <path>
        //        [--bundle <path>]  (omit to use fresh template)
        //        [--no-npm]         (skip NPM SSL registration)
        if (sub === "provision") {
          const slug = args[1];
          if (!slug || slug.startsWith("--")) {
            onLine("✗ usage: db provision <slug> --kong <port> --studio <port> --pg <port> --ssl <port> --dir <path>");
            onLine("         [--bundle <path>]  — source bundle (omit = fresh template)");
            onLine("         [--no-npm]         — skip NPM SSL registration");
            return 1;
          }

          const kongPort   = parseInt(argValue(args, "--kong")   ?? "", 10);
          const studioPort = parseInt(argValue(args, "--studio") ?? "", 10);
          const pgPort     = parseInt(argValue(args, "--pg")     ?? "", 10);
          const sslPort    = parseInt(argValue(args, "--ssl")    ?? `${kongPort + 443}`, 10);
          const targetDir  = argValue(args, "--dir");
          const bundlePath = argValue(args, "--bundle");
          const noNpm      = args.includes("--no-npm");

          if (!kongPort || !studioPort || !pgPort || !targetDir) {
            onLine("✗ --kong, --studio, --pg, and --dir are all required");
            return 1;
          }

          try {
            await validateDatabaseSlug(slug);
          } catch (e) {
            onLine(`✗ ${String(e instanceof Error ? e.message : e)}`);
            return 1;
          }

          try {
            await provisionDatabase(
              slug,
              {
                bundlePath: bundlePath ?? undefined,
                targetDir,
                ports: { kong: kongPort, studio: studioPort, postgres: pgPort, kongSSL: sslPort },
                registerNpm: !noNpm,
              },
              null,
              onLine,
            );
          } catch (e) {
            onLine(`✗ ${String(e instanceof Error ? e.message : e)}`);
            return 1;
          }
          return 0;
        }

        // ── db core <status|start|stop|restart|verify> ────────────────────────
        if (sub === "core") {
          const coreSub = args[1] ?? "status";
          const bg = args.includes("--bg");

          if (coreSub === "status" || coreSub === "verify") {
            const { verifyCoreStack } = await import("../db-api.ts");
            const result = await verifyCoreStack(coreDockerInstance, onLine);
            onLine(`\n${result.overall === "healthy" ? "✓" : "⚠"} ${result.overall}  (${result.runningCount}/${result.totalCount} running)`);
            return result.overall === "healthy" ? 0 : 1;
          }

          if (coreSub === "start") {
            const runStart = async (l: (msg: string) => void) => {
              l(`Starting core Supabase stack…`);
              const ok = await startCoreStack(coreDockerInstance, l);
              l(ok ? `✓ Core started` : `✗ Core start failed`);
              return ok ? 0 : 1;
            };
            if (bg) {
              runOpQueued("Start core DB", runStart);
              if (args.includes("--json")) onLine(JSON.stringify({ status: "queued", taskId: "Start core DB" }));
              else onLine("⚡ Core start queued");
              return 3;
            }
            return runStart(onLine);
          }

          if (coreSub === "stop") {
            const runStop = async (l: (msg: string) => void) => {
              l(`Stopping core Supabase stack…`);
              const ok = await stopCoreStack(coreDockerInstance, l);
              l(ok ? `✓ Core stopped` : `✗ Core stop failed`);
              return ok ? 0 : 1;
            };
            if (bg) {
              runOpQueued("Stop core DB", runStop);
              if (args.includes("--json")) onLine(JSON.stringify({ status: "queued", taskId: "Stop core DB" }));
              else onLine("⚡ Core stop queued");
              return 3;
            }
            return runStop(onLine);
          }

          if (coreSub === "restart") {
            const runRestart = async (l: (msg: string) => void) => {
              l(`Restarting core Supabase stack…`);
              const ok = await restartCoreStack(coreDockerInstance, l);
              l(ok ? `✓ Core restarted` : `✗ Core restart failed`);
              return ok ? 0 : 1;
            };
            if (bg) {
              runOpQueued("Restart core DB", runRestart);
              if (args.includes("--json")) onLine(JSON.stringify({ status: "queued", taskId: "Restart core DB" }));
              else onLine("⚡ Core restart queued");
              return 3;
            }
            return runRestart(onLine);
          }

          onLine("✗ usage: db core <status|start|stop|restart|verify> [--bg]");
          return 2;
        }

        // ── db heal ──────────────────────────────────────────────────────────
        // Reuses DbPanel → [h] → healCoreStack() — same function, straight to CLI.
        // Runs docker compose pull + up with restart-on-fail for all core services.
        if (sub === "heal") {
          onLine("Healing core Supabase stack…");
          const code = await healCoreStack(coreDockerInstance, onLine);
          if (code === 0) onLine("✓ Core stack healed — services should be healthy shortly");
          return code;
        }

        // ── db blank <slug> [--no-npm] ────────────────────────────────────────
        // Fastest path: scaffold + start a fresh empty Supabase instance.
        // MCP config is written with real keys immediately.
        // Usage: db blank <slug> [--no-npm] [--name "Human Label"]
        if (sub === "blank") {
          const slug = args[1];
          if (!slug || slug.startsWith("--")) {
            onLine("✗ usage: db blank <slug> [--no-npm] [--name <label>]");
            onLine("  slug rules: 2–40 chars, lowercase letters/digits/hyphens");
            onLine("  example:    db blank my-project");
            return 1;
          }
          // Validate slug early so the error is clean and immediate
          try {
            await validateDatabaseSlug(slug);
          } catch (e) {
            onLine(`✗ ${String(e instanceof Error ? e.message : e)}`);
            return 1;
          }
          const noNpm = args.includes("--no-npm");
          const name  = argValue(args, "--name");
          try {
            await createBlankDatabase(slug, { registerNpm: !noNpm, instanceName: name }, onLine);
          } catch (e) {
            onLine(`✗ ${String(e instanceof Error ? e.message : e)}`);
            return 1;
          }
          return 0;
        }

        // ── db smoke-test ──────────────────────────────────────────────────────
        // End-to-end test: blank DB → Postgres probe → Kong probe → Studio probe
        // → snapshot → list snapshots → teardown.
        if (sub === "smoke-test") {
          const result = await smokeTestDatabase(onLine);
          return result.ok ? 0 : 1;
        }

        // ── db instances ───────────────────────────────────────────────────────
        // Alias: list all runtime instances (same as `db instance list`)
        if (sub === "instances") {
          const registry = await loadRegistry();
          if (args.includes("--json")) {
            onLine(JSON.stringify(registry, null, 2));
            return 0;
          }
          const projectSlug = coreDockerInstance.slug;
          onLine(`Runtime instances  ·  project: ${projectSlug}`);
          if (registry.length === 0) {
            onLine(`  (none — create one: unaxis ${projectSlug} db blank <name>)`);
            return 0;
          }
          onLine("");
          for (const inst of registry) {
            const p      = inst.ports;
            const health = inst.healthState === "healthy" ? "●" : inst.healthState === "degraded" ? "◑" : "○";
            const apiUrl    = inst.npmApiUrl    ?? `http://127.0.0.1:${p.kong}`;
            const studioUrl = inst.npmStudioUrl ?? `http://127.0.0.1:${p.studio}`;
            onLine(`  ${health} ${inst.name}`);
            onLine(`      slug   ${inst.slug}   status: ${inst.status}`);
            onLine(`      api    ${apiUrl}`);
            onLine(`      studio ${studioUrl}`);
            onLine(`      local  kong:${p.kong}  pg:${p.postgres}`);
          }
          onLine(`\n✓ ${registry.length} instance${registry.length !== 1 ? "s" : ""}  (project: ${projectSlug})`);
          return 0;
        }

        // ── db instance <name> <sub> ───────────────────────────────────────────
        if (sub === "instance") {
          const nameOrSub = args[1];
          const projectSlug = coreDockerInstance.slug;

          // db instance list
          if (!nameOrSub || nameOrSub === "list") {
            const registry = await loadRegistry();
            if (args.includes("--json")) {
              onLine(JSON.stringify(registry, null, 2));
              return 0;
            }
            onLine(`Runtime instances  ·  project: ${projectSlug}`);
            if (registry.length === 0) {
              onLine(`  (none — create one: unaxis ${projectSlug} db blank <name>)`);
              return 0;
            }
            onLine("");
            for (const inst of registry) {
              const p      = inst.ports;
              const health = inst.healthState === "healthy" ? "●" : inst.healthState === "degraded" ? "◑" : "○";
              const apiUrl    = inst.npmApiUrl    ?? `http://127.0.0.1:${p.kong}`;
              const studioUrl = inst.npmStudioUrl ?? `http://127.0.0.1:${p.studio}`;
              onLine(`  ${health} ${inst.name}`);
              onLine(`      slug   ${inst.slug}   status: ${inst.status}`);
              onLine(`      api    ${apiUrl}`);
              onLine(`      studio ${studioUrl}`);
              onLine(`      local  kong:${p.kong}  pg:${p.postgres}`);
            }
            onLine(`\n✓ ${registry.length} instance${registry.length !== 1 ? "s" : ""}  (project: ${projectSlug})`);
            return 0;
          }

          // Resolve instance by name, slug, or id
          const registry = await loadRegistry();
          const inst = registry.find(
            (i) => i.name === nameOrSub || i.slug === nameOrSub || i.id === nameOrSub,
          );
          if (!inst) {
            onLine(`✗ instance "${nameOrSub}" not found`);
            onLine(`  Run: db instance list`);
            return 1;
          }

          const instanceSub = args[2] ?? "status";
          // containerPrefix may not be persisted in older registry entries — derive from slug
          const containerPrefix = inst.containerPrefix ?? `${inst.slug}-`;

          // db instance <name> status
          // Uses the local env agent to get real-time container state — same
          // pathway as `env containers`, filters by containerPrefix.
          if (instanceSub === "status") {
            onLine(`Instance  ${inst.name}  (${inst.slug})`);
            onLine(`  Kong    http://127.0.0.1:${inst.ports.kong}`);
            onLine(`  Studio  http://127.0.0.1:${inst.ports.studio}`);
            onLine(`  PG      postgresql://postgres:***@127.0.0.1:${inst.ports.postgres}/postgres`);
            const envs      = await loadEnvironments();
            const localEnv  = envs.find((e) => e.isDefaultTarget) ?? envs.find((e) => e.agentUrl?.includes("127.0.0.1"));
            if (localEnv?.agentUrl) {
              const containers = await fetchContainers(localEnv);
              const mine = (containers ?? []).filter((c) =>
                c.Names.some((n) => n.replace(/^\//, "").startsWith(containerPrefix)),
              );
              if (mine.length === 0) {
                onLine(`  (no containers found with prefix "${inst.containerPrefix}")`);
              } else {
                for (const c of mine) {
                  const dot  = c.State === "running" ? "●" : "○";
                  const name = c.Names[0]?.replace(/^\//, "").replace(containerPrefix, "") ?? c.Id.slice(0, 12);
                  onLine(`  ${dot} ${name.padEnd(14)} ${c.State}`);
                }
                const running = mine.filter((c) => c.State === "running").length;
                onLine(`\n  ${running}/${mine.length} running`);
              }
            } else {
              onLine("  ⚠ No local agent — run: env ping");
            }
            return 0;
          }

          // db instance <name> logs [--tail <n>]
          // Uses env agent fetchContainerLogs for db, kong, studio.
          if (instanceSub === "logs") {
            const tail     = parseTail(args.slice(3));
            const envs     = await loadEnvironments();
            const localEnv = envs.find((e) => e.isDefaultTarget) ?? envs.find((e) => e.agentUrl?.includes("127.0.0.1"));
            const logSvcs  = ["db", "kong", "studio"];
            for (const svc of logSvcs) {
              const container = `${containerPrefix}${svc}`;
              onLine(`\n── ${inst.slug} / ${svc} ──────────────────────────────────────`);
              if (localEnv?.agentUrl) {
                const text = await fetchContainerLogs(localEnv, container, tail);
                if (text === null) onLine(`  (could not reach container "${container}")`);
                else text.split("\n").filter(Boolean).forEach(onLine);
              } else {
                await captureDockerLogs({ label: `${inst.slug}/${svc}`, container, tail }, onLine);
              }
            }
            onLine(`\n✓ instance logs (${logSvcs.join(", ")})`);
            return 0;
          }

          // db instance <name> restart
          if (instanceSub === "restart") {
            onLine(`Restarting ${inst.name} (${inst.slug})…`);
            const ok = await restartCoreStack(inst, onLine);
            onLine(ok ? `✓ ${inst.name} restarted` : `✗ restart failed`);
            return ok ? 0 : 1;
          }

          // db instance <name> stop
          if (instanceSub === "stop") {
            onLine(`Stopping ${inst.name} (${inst.slug})…`);
            const ok = await stopCoreStack(inst, onLine);
            onLine(ok ? `✓ ${inst.name} stopped` : `✗ stop failed`);
            return ok ? 0 : 1;
          }

          // db instance <name> start
          if (instanceSub === "start") {
            onLine(`Starting ${inst.name} (${inst.slug})…`);
            const ok = await startCoreStack(inst, onLine);
            onLine(ok ? `✓ ${inst.name} started` : `✗ start failed`);
            return ok ? 0 : 1;
          }

          // db instance <name> remove  — stop, prune compose project, deregister
          if (instanceSub === "remove") {
            const confirmed = args.includes("--confirm");
            if (!confirmed) {
              onLine(`⚠  This will stop, prune, and deregister "${inst.name}" (${inst.slug}).`);
              onLine(`   Re-run with --confirm to proceed.`);
              return 2;
            }
            await removeCoreStack(inst, onLine);
            return 0;
          }

          // db instance <name> npm  — re-register NPM proxy hosts (idempotent)
          if (instanceSub === "npm") {
            const { reregisterInstanceNpm } = await import("../db-api.ts");
            const ok = await reregisterInstanceNpm(inst, onLine);
            return ok ? 0 : 1;
          }

          // db instance <name> snapshot [--bg]
          // --bg: queue as a TUI background op and return immediately (no socket wait)
          if (instanceSub === "snapshot") {
            const bg = args.includes("--bg");
            if (bg) {
              runOpQueued(
                `Snapshot  ${inst.name}`,
                async (bgLine) => {
                  const { snapshotInstance } = await import("../zone/snapshot.ts");
                  const bundle = await snapshotInstance(inst, bgLine);
                  bgLine(`✓ ${bundle.bundlePath}`);
                  if (bundle.archivePath) bgLine(`  Archive: ${bundle.archivePath}`);
                  return 0;
                },
              );
              if (args.includes("--json")) onLine(JSON.stringify({ status: "queued", taskId: `Snapshot  ${inst.name}` }));
              else onLine(`⚡ Snapshot queued for ${inst.name} — watch TUI stack for progress`);
              return 3; // queued — still running in TUI stack
            }
            const { snapshotInstance } = await import("../zone/snapshot.ts");
            const bundle = await snapshotInstance(inst, onLine);
            onLine(`✓ Snapshot: ${bundle.bundlePath}`);
            if (bundle.archivePath) onLine(`  Archive:  ${bundle.archivePath}`);
            return 0;
          }

          // db instance <name> snapshots  — list all captured bundles for this instance
          if (instanceSub === "snapshots") {
            const { listSnapshots } = await import("../zone/snapshot.ts");
            const bundles = await listSnapshots(inst);
            if (bundles.length === 0) {
              onLine(`  (no snapshots for "${inst.name}" — run: db instance ${nameOrSub} snapshot)`);
              return 0;
            }
            onLine(`Snapshots for  ${inst.name}  (${bundles.length} total)`);
            for (const b of bundles) {
              const date = new Date(b.createdAt).toLocaleString();
              const arch = b.archivePath ? "  📦" : "";
              onLine(`  ${b.id}  ${date}${arch}`);
              onLine(`    ${b.bundlePath}`);
            }
            return 0;
          }

          // db instance <name> restore --bundle <path>
          // Stops the stack, pg_restore, restores storage, restarts. Destructive.
          if (instanceSub === "restore") {
            const bundlePath = argValue(args.slice(2), "--bundle");
            if (!bundlePath) {
              onLine(`✗ usage: db instance ${nameOrSub} restore --bundle <path-to-bundle-dir>`);
              onLine(`  Tip: run "db instance ${nameOrSub} snapshots" to list available bundles`);
              return 2;
            }
            const { restoreInstance } = await import("../zone/snapshot.ts");
            const code = await restoreInstance(bundlePath, onLine, inst);
            return code;
          }

          // db instance <name> verify  — sync health state from Docker, surface issues
          if (instanceSub === "verify") {
            const { verifyCoreStack } = await import("../db-api.ts");
            const result = await verifyCoreStack(inst, onLine);
            onLine(`\n${result.overall === "healthy" ? "✓" : "⚠"} ${result.overall}  (${result.runningCount}/${result.totalCount} running)`);
            return result.overall === "healthy" ? 0 : 1;
          }

          // db instance <name> mcp  — re-output MCP connection config for this instance
          // Useful when mcp-config.json is lost or keys need to be shared.
          if (instanceSub === "mcp") {
            const mcpConfigPath = `${inst.dockerPath}/mcp-config.json`;
            const mcpEnvPath    = `${inst.dockerPath}/mcp-env.txt`;
            const { readFileSync, existsSync } = await import("fs");
            if (!existsSync(mcpConfigPath)) {
              onLine(`✗ mcp-config.json not found at ${mcpConfigPath}`);
              onLine(`  Re-register NPM first: db instance ${nameOrSub} npm`);
              return 1;
            }
            const config  = readFileSync(mcpConfigPath, "utf-8");
            const envText = existsSync(mcpEnvPath) ? readFileSync(mcpEnvPath, "utf-8") : "";
            onLine(`MCP config for  ${inst.name}  (${inst.slug})`);
            onLine(`  Public API:    ${inst.npmApiUrl ?? "(not registered)"}`);
            onLine(`  Public Studio: ${inst.npmStudioUrl ?? "(not registered)"}`);
            onLine(`  Local API:     http://127.0.0.1:${inst.ports.kong}`);
            onLine(`  Studio pass:   ${inst.secrets.dashboardPassword}`);
            onLine(`  Anon key:      ${inst.secrets.anonKey.slice(0, 40)}…`);
            onLine(`\n── mcp-config.json ──────────────────────────────────`);
            config.split("\n").forEach(onLine);
            if (envText) {
              onLine(`\n── mcp-env.txt ──────────────────────────────────────`);
              envText.split("\n").forEach(onLine);
            }
            return 0;
          }

          // db instance <name> delete --confirm
          // Full teardown: NPM hosts removed, docker volumes deleted, filesystem removed, registry entry gone.
          // Use "remove" to keep volumes; use "delete" to destroy everything.
          if (instanceSub === "delete") {
            const confirmed = args.includes("--confirm");
            if (!confirmed) {
              onLine(`⚠  This will PERMANENTLY delete "${inst.name}" (${inst.slug}).`);
              onLine(`   NPM proxy hosts, containers, volumes, and all files will be removed.`);
              onLine(`   Snapshot first if you want a recovery point:`);
              onLine(`     db instance ${nameOrSub} snapshot`);
              onLine(`   Then re-run with --confirm to proceed.`);
              return 2;
            }
            const { deleteRuntimeInstance } = await import("../db-api.ts");
            const ok = await deleteRuntimeInstance(inst, onLine);
            return ok ? 0 : 1;
          }

          // db instance <name> fix-auth
          // Reset supabase_admin password inside the DB container to match POSTGRES_PASSWORD.
          // Use when services (auth/rest/storage/pooler) crash with "password authentication failed".
          if (instanceSub === "fix-auth") {
            const { execSync } = await import("child_process");
            const dbContainer = `${inst.slug}-db`;
            // Prefer registry secret; fall back to reading .env directly (older instances)
            let pgPass: string = inst.secrets?.postgresPassword ?? "";
            if (!pgPass) {
              const { readFileSync, existsSync } = await import("fs");
              const envPath = `${inst.dockerPath}/.env`;
              if (existsSync(envPath)) {
                const envLine = readFileSync(envPath, "utf-8")
                  .split("\n").find((l) => l.startsWith("POSTGRES_PASSWORD="));
                pgPass = envLine?.split("=", 2)[1]?.trim() ?? "";
              }
            }
            if (!pgPass) {
              onLine(`✗ Could not determine POSTGRES_PASSWORD for ${inst.name}`);
              return 1;
            }
            onLine(`Resetting supabase_admin password in ${dbContainer}…`);
            const sql = `ALTER USER supabase_admin WITH PASSWORD '${pgPass}'; ALTER USER supabase_auth_admin WITH PASSWORD '${pgPass}';`;
            try {
              const cmd = `docker exec ${dbContainer} psql -U supabase_admin -c "${sql.replace(/"/g, '\"')}"`;
              execSync(cmd, { stdio: "pipe" });
              onLine(`✓ supabase_admin + supabase_auth_admin passwords updated`);
              onLine(`  Restart the instance to bring services back: db instance ${nameOrSub} restart`);
              return 0;
            } catch (e) {
              onLine(`✗ exec failed: ${e instanceof Error ? e.message : e}`);
              return 1;
            }
          }

          onLine(`✗ usage: db instance <name> status|logs|start|stop|restart|snapshot|snapshots|restore|verify|delete|remove|npm|fix-auth`);
          return 2;
        }

        // ── db clone <source-name> <new-name> [--no-npm] [--bg] ──────────────
        // Clone an existing instance (or core) into a new independent instance.
        // --bg: queue as a TUI background op and return immediately (no socket wait)
        if (sub === "clone") {
          const sourceName = args[1];
          const newName    = args[2];
          if (!sourceName || !newName || sourceName.startsWith("--") || newName.startsWith("--")) {
            onLine(`✗ usage: db clone <source-name> <new-name> [--no-npm] [--bg]`);
            onLine(`  source-name  name or slug of existing instance (or "core" for the core DB)`);
            onLine(`  new-name     display name for the new clone (e.g. "My Clone")`);
            onLine(`  --no-npm     skip NPM SSL proxy registration`);
            onLine(`  --bg         queue in TUI stack, return immediately (no timeout)`);
            onLine(`  Example: db clone core "Staging" --bg`);
            return 2;
          }

          const registerNpm = !args.includes("--no-npm");
          const bg          = args.includes("--bg");

          // Resolve source — "core" is a special alias for CORE_INSTANCE
          type RI = import("../zone/supabase-factory.ts").RuntimeInstance;
          let sourceInst: RI;
          if (sourceName === "core") {
            const { CORE_INSTANCE_SNAPSHOT_TARGET } = await import("../db-api.ts");
            sourceInst = CORE_INSTANCE_SNAPSHOT_TARGET;
          } else {
            const registry = await loadRegistry();
            const found = registry.find(
              (i) => i.name === sourceName || i.slug === sourceName || i.id === sourceName,
            );
            if (!found) {
              onLine(`✗ source instance "${sourceName}" not found`);
              onLine(`  Run: db instances   or use "core" to clone the core database`);
              return 1;
            }
            sourceInst = found;
          }

          const runClone = async (bgLine: (l: string) => void) => {
            const { snapshotInstance } = await import("../zone/snapshot.ts");
            const { cloneFromSnapshot } = await import("../zone/database-manager.ts");
            bgLine(`📸 Snapshotting ${sourceInst.name} (${sourceInst.slug})`);
            const bundle = await snapshotInstance(sourceInst, bgLine);
            bgLine(`✓ Snapshot: ${bundle.id}`);
            const result = await cloneFromSnapshot(bundle.bundlePath, newName, { registerNpm }, bgLine);
            bgLine(`\n✓ Clone complete  →  ${result.publicApiUrl}`);
            bgLine(`  Studio: ${result.publicStudioUrl}`);
            bgLine(`  Pass:   ${result.instance.secrets.dashboardPassword}`);
            return 0;
          };

          if (bg) {
            runOpQueued(`Clone  ${sourceInst.slug}  →  ${newName}`, runClone);
            if (args.includes("--json")) {
              onLine(JSON.stringify({ status: "queued", taskId: `Clone  ${sourceInst.slug}  →  ${newName}` }));
            } else {
              onLine(`⚡ Clone queued: ${sourceInst.name} → "${newName}"`);
              onLine(`  Watch TUI stack for progress (takes 2–5 min)`);
            }
            return 3; // queued — still running in TUI stack
          }

          return runClone(onLine);
        }

        // ── db migrate-control ─────────────────────────────────────────────
        // One-time import from unenter.db Supabase → local SQLite control-db.
        if (sub === "migrate-control") {
          const { migrateControlDb } = await import("../control-db-migrate.js");
          return await migrateControlDb(onLine);
        }

        // ── db control-info ────────────────────────────────────────────────
        // Show local SQLite control-db stats (path, counts, schema version).
        if (sub === "control-info") {
          const { dbGetInfo } = await import("../control-db.js");
          const info = dbGetInfo();
          onLine(`  path:         ${info.path}`);
          onLine(`  zones:        ${info.zoneCount}`);
          onLine(`  environments: ${info.envCount}`);
          onLine(`  migrations:   ${info.migrations}`);
          return 0;
        }

        // ── db dedup-environments ──────────────────────────────────────────
        // Merge duplicate environment rows that share a name (e.g. double POWER
        // from auto-seed + migration).  Keeps the real UUID row, merges missing
        // fields from the placeholder, then deletes the placeholder.
        if (sub === "dedup-environments") {
          const { dbDeduplicateEnvironments, dbGetInfo } = await import("../control-db.js");
          const removed = dbDeduplicateEnvironments();
          const info    = dbGetInfo();
          onLine(`✓ Dedup complete — ${removed} duplicate(s) removed`);
          onLine(`  environments now: ${info.envCount}`);
          return 0;
        }

        onLine("✗ usage: db backup|logs|snapshot|snapshots|restore|clone|template-capture|templates|provision|blank|smoke-test|instance|instances|migrate-control|control-info");
        return 2;
      },

      // unaxis proxy <restart|build|agent-reset|push-agent> [--bg]
      proxy: async (args, onLine) => {
        const sub = args[0] ?? "status";
        const bg = args.includes("--bg");

        if (sub === "status") {
          onLine(`Proxy status: ${ipcStateRef.current.proxyStatus}`);
          return 0;
        }

        if (sub === "restart") {
          const runRestart = async (l: (msg: string) => void) => {
            const { reloadProxy } = await import("../docker.ts");
            return reloadProxy(l);
          };
          if (bg) {
            runOpQueued("Restart proxy", runRestart);
            if (args.includes("--json")) onLine(JSON.stringify({ status: "queued", taskId: "Restart proxy" }));
            else onLine("⚡ Proxy restart queued");
            return 3;
          }
          return runRestart(onLine);
        }

        if (sub === "build") {
          const clean = args.includes("--clean");
          const runBuild = async (l: (msg: string) => void) => {
            const { rebuildProxy } = await import("../docker.ts");
            return rebuildProxy(l, clean);
          };
          if (bg) {
            const taskId = clean ? "Rebuild proxy (clean)" : "Rebuild proxy";
            runOpQueued(taskId, runBuild);
            if (args.includes("--json")) onLine(JSON.stringify({ status: "queued", taskId }));
            else onLine("⚡ Proxy build queued");
            return 3;
          }
          return runBuild(onLine);
        }

        if (sub === "push-agent") {
          const runPush = async (l: (msg: string) => void) => {
            const { buildAndPushAgent } = await import("../agent-ops.ts");
            const code = await buildAndPushAgent(l);
            if (code === 0) l("✓ Agent image pushed — go to Environments → [u] on L0V3 to deploy");
            return code;
          };
          if (bg) {
            runOpQueued("Push agent → GHCR", runPush);
            if (args.includes("--json")) onLine(JSON.stringify({ status: "queued", taskId: "Push agent → GHCR" }));
            else onLine("⚡ Push agent queued");
            return 3;
          }
          return runPush(onLine);
        }

        if (sub === "agent-reset") {
          const runReset = async (l: (msg: string) => void) => {
            const { unlinkSync } = await import("fs");
            const { join } = await import("path");
            const { PROJECT_DIR } = await import("../../config/stack.ts");
            const stateFile = join(PROJECT_DIR, "proxy-config", "agent-state.json");
            try {
              unlinkSync(stateFile);
              l("✓ TOFU pairing state cleared — agent will pair on next connect");
            } catch (err: any) {
              const msg = err.message || String(err);
              if (msg.includes("ENOENT")) l("✓ No pairing state found — agent is already unpaired");
              else { l(`✗ Could not remove state file: ${msg}`); return 1; }
            }
            l("Restarting proxy to apply...");
            const { reloadProxy } = await import("../docker.ts");
            return reloadProxy(l);
          };
          if (bg) {
            runOpQueued("Reset agent pairing", runReset);
            if (args.includes("--json")) onLine(JSON.stringify({ status: "queued", taskId: "Reset agent pairing" }));
            else onLine("⚡ Agent reset queued");
            return 3;
          }
          return runReset(onLine);
        }

        onLine("✗ usage: proxy <status|restart|build|agent-reset|push-agent> [--bg] [--clean]");
        return 2;
      },

      // ── project <subcommand> ─────────────────────────────────────────────────
      // Domain-level management for unenter.live — things that belong to the
      // core project/domain rather than the Supabase DB layer.
      //
      //   project studio <public|local|toggle|status>
      //     Toggle the NPM proxy host for studio.unenter.live on/off.
      //     Lets you expose core Studio publicly (e.g. from your phone) then
      //     lock it back down with a single command.
      //     TUI equivalent: [P] on the Core Supabase DB panel.
      //
      project: async (args, onLine) => {
        const sub = args[0] ?? "help";

        if (sub === "help" || sub === "--help") {
          onLine("unaxis project — projects, workspaces, and the deploy ledger");
          onLine("");
          onLine("  project ls                      — list registered projects (control.db)");
          onLine("  project workspaces              — list workspaces (provider, root, env)");
          onLine("  project ledger [<zone>]         — recent source→image→deploy ledger entries");
          onLine("  project studio <public|local|toggle|status>  — core Studio exposure");
          return 0;
        }

        // ── workspace control plane (projects · workspaces · deploy ledger) ──
        // Lazily seed this machine's project as control.db project #1 + a
        // local-windows workspace, so the spine has real data to show/test.
        const seedDefaultProject = async () => {
          const cdb = await import("../control-db.js");
          if (cdb.dbGetProjects().length > 0) return;
          let slug = "unenter.live", root = process.cwd();
          try {
            const cfg: any = await import("../../config/stack.ts");
            if (cfg.PROJECT_SLUG) slug = cfg.PROJECT_SLUG;
            if (cfg.PROJECT_DIR)  root = cfg.PROJECT_DIR;
          } catch { /* fall back to cwd */ }
          let gitRemote = "", branch = "main";
          try {
            const { spawnSync } = await import("child_process");
            const g = (a: string[]) => { try { const r = spawnSync("git", a, { cwd: root, encoding: "utf-8" }); return r.status === 0 ? (r.stdout ?? "").trim() : ""; } catch { return ""; } };
            gitRemote = g(["remote", "get-url", "origin"]);
            branch    = g(["rev-parse", "--abbrev-ref", "HEAD"]) || "main";
          } catch { /* best-effort */ }
          const pid = cdb.dbUpsertProject({ slug, name: slug, gitRemote, defaultBranch: branch, rootPath: root });
          cdb.dbUpsertWorkspace({ projectId: pid, provider: "local-windows", root, branch, lifecycleState: "active" });
        };

        if (sub === "ls" || sub === "list") {
          await seedDefaultProject();
          const { dbGetProjects } = await import("../control-db.js");
          const projects = dbGetProjects();
          if (args.includes("--json")) { onLine(JSON.stringify(projects, null, 2)); return 0; }
          if (projects.length === 0) { onLine("  (no projects)"); return 0; }
          for (const p of projects) {
            onLine(`  ${p.slug.padEnd(16)} ${p.name.padEnd(18)} ${p.rootPath}`);
            onLine(`     git: ${p.gitRemote || "—"}   branch: ${p.defaultBranch}`);
          }
          onLine(`✓ ${projects.length} project${projects.length !== 1 ? "s" : ""}`);
          return 0;
        }

        if (sub === "workspaces" || sub === "ws") {
          await seedDefaultProject();
          const { dbGetWorkspaces } = await import("../control-db.js");
          const ws = dbGetWorkspaces();
          if (args.includes("--json")) { onLine(JSON.stringify(ws, null, 2)); return 0; }
          if (ws.length === 0) { onLine("  (no workspaces)"); return 0; }
          for (const w of ws) {
            onLine(`  ${w.id.slice(0, 8)}  provider=${w.provider.padEnd(13)} state=${w.lifecycleState}`);
            onLine(`     root: ${w.root || "—"}   env: ${w.environmentId ?? "—"}`);
          }
          onLine(`✓ ${ws.length} workspace${ws.length !== 1 ? "s" : ""}`);
          return 0;
        }

        if (sub === "ledger") {
          const { dbGetLedger } = await import("../control-db.js");
          const zoneKey = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
          const entries = dbGetLedger({ zoneKey, limit: 20 });
          if (args.includes("--json")) { onLine(JSON.stringify(entries, null, 2)); return 0; }
          if (entries.length === 0) { onLine("  (ledger empty — build/deploy a zone to populate it)"); return 0; }
          for (const e of entries) {
            onLine(`  ${(e.createdAt ?? "").slice(0, 19)}  ${e.action.padEnd(12)} ${e.zoneKey.padEnd(12)} ${e.sourceRef || "—"}`);
            if (e.image) onLine(`     ${e.image}`);
          }
          onLine(`✓ ${entries.length} ledger entr${entries.length !== 1 ? "ies" : "y"}`);
          return 0;
        }

        if (sub === "studio") {
          const action = args[1] ?? "status";
          const { npmFindHost: findHost, npmEnableHost: enableHost, npmDisableHost: disableHost } = await import("../npm-api.ts");
          const { DOMAIN, STUDIO_PROJECT_URL: studioLocalUrl } = await import("../../config/stack.ts");
          const studioDomain = `studio.${DOMAIN}`;
          const host = await findHost(studioDomain);
          if (!host) {
            onLine(`✗ No NPM proxy host found for ${studioDomain}`);
            onLine(`  Create one in NPM pointing to http://<POWER>:3002 first.`);
            return 1;
          }
          const isPublic = host.enabled === 1;

          if (action === "status") {
            onLine(`Studio  ${studioDomain}`);
            onLine(`  ${isPublic ? "● public  (NPM host #" + host.id + " enabled)" : "○ local   (NPM host #" + host.id + " disabled)"}`);
            onLine(`  → ${host.forward_scheme}://${host.forward_host}:${host.forward_port}`);
            return 0;
          }

          const shouldEnable =
            action === "public" ? true  :
            action === "local"  ? false :
            action === "toggle" ? !isPublic :
            null;

          if (shouldEnable === null) {
            onLine("✗ usage: project studio <public|local|toggle|status>");
            return 2;
          }

          if (shouldEnable === isPublic) {
            onLine(`Studio is already ${isPublic ? "public" : "local-only"} — nothing to do.`);
            return 0;
          }

          if (shouldEnable) {
            await enableHost(host.id);
            onLine(`✓ Studio is now PUBLIC`);
            onLine(`  https://${studioDomain}/project/default`);
            onLine(`  Run [project studio local] when you're done.`);
          } else {
            await disableHost(host.id);
            onLine(`✓ Studio is now LOCAL-ONLY`);
            onLine(`  ${studioLocalUrl}`);
          }
          return 0;
        }

        onLine("✗ unknown project subcommand: " + JSON.stringify(sub));
        onLine("  available: studio");
        onLine("  run [project help] for usage");
        return 2;
      },

      // ── npm list [--search <domain>]
      // ── npm search <domain>
      // ── npm delete <id>   — remove a proxy host by NPM ID (use after orphaned instance cleanup)
      npm: async (args, onLine) => {
        const sub    = args[0] ?? "list";
        const search = argValue(args, "--search") ?? (sub === "search" ? args[1] : undefined);

        const { npmListHosts, npmPing, npmGetToken, npmDeleteHost, npmFindHost } = await import("../npm-api.ts");

        const reachable = await npmPing();
        if (!reachable) {
          onLine(`✗ NPM unreachable at ${NPM_HOST.apiUrl} (${NPM_HOST.label}) — is that host up?`);
          return 1;
        }

        // ── npm delete <id|domain> ───────────────────────────────────────────
        if (sub === "delete") {
          const target = args[1];
          if (!target) {
            onLine(`✗ usage: npm delete <id|domain>`);
            // npm enable <id>
          if (npmSub === "enable" || npmSub === "disable") {
            const idArg = args[2];
            if (!idArg) { onLine(`✗ usage: npm ${npmSub} <id>`); return 2; }
            const id = parseInt(idArg, 10);
            if (isNaN(id)) { onLine(`✗ id must be a number, got: "${idArg}"`); return 2; }
            onLine(`${npmSub === "enable" ? "Enabling" : "Disabling"} NPM host #${id}…`);
            try {
              if (npmSub === "enable") {
                await npmEnableHost(id);
              } else {
                await npmDisableHost(id);
              }
              onLine(`✓ Host #${id} ${npmSub}d`);
              return 0;
            } catch (e) {
              onLine(`✗ ${String(e)}`);
              return 1;
            }
          }
          onLine(`  id      numeric NPM host ID (from npm list output)`);
            onLine(`  domain  exact domain name (e.g. db.myapp.unenter.live)`);
            return 2;
          }
          let token: string;
          try { token = await npmGetToken(); }
          catch (e) { onLine(`✗ NPM auth failed: ${e}`); return 1; }

          const numericId = parseInt(target, 10);
          let hostId: number;

          if (!isNaN(numericId)) {
            hostId = numericId;
          } else {
            // Resolve by domain name
            const host = await npmFindHost(target, token);
            if (!host) {
              onLine(`✗ No NPM host found for domain "${target}"`);
              return 1;
            }
            hostId = host.id;
            onLine(`  Resolved "${target}" → host #${hostId}`);
          }

          try {
            await npmDeleteHost(hostId, token);
            onLine(`✓ Deleted NPM host #${hostId}`);
            return 0;
          } catch (e) {
            onLine(`✗ Delete failed: ${e instanceof Error ? e.message : e}`);
            return 1;
          }
        }

        const hosts = await npmListHosts();
        let filtered = hosts;
        if (search) {
          const q = search.toLowerCase();
          filtered = hosts.filter((h) =>
            h.domain_names.some((d) => d.toLowerCase().includes(q)),
          );
        }

        if (filtered.length === 0) {
          onLine(search ? `  (no hosts matching "${search}")` : `  (no proxy hosts)`);
          return 0;
        }

        onLine(`NPM Proxy Hosts on ${NPM_HOST.ip}, ${NPM_HOST.label}  (${filtered.length}${search ? ` matching "${search}"` : ""} of ${hosts.length} total)`);
        onLine("");

        for (const h of filtered) {
          const enabled   = h.enabled ? "●" : "○";
          const ssl       = h.certificate_id ? "🔒" : "  ";
          const target    = `${h.forward_scheme}://${h.forward_host}:${h.forward_port}`;
          const domains   = h.domain_names.join(", ");
          onLine(`  ${enabled} ${ssl}  ${String(h.id).padStart(4)}  ${domains}`);
          onLine(`             → ${target}`);
        }
        return 0;
      },

      // unaxis preflight edit --zone <zone> [--db-backup] [--dev] [--watch] [--label <text>]
      preflight: async (args, onLine) => {
        const sub = args[0];
        if (sub !== "edit") {
          onLine("✗ usage: preflight edit --zone <zone> [--db-backup] [--dev] [--watch] [--label <text>]");
          return 2;
        }

        const zoneName = argValue(args, "--zone");
        if (!zoneName) {
          onLine("✗ usage: preflight edit --zone <zone> [--db-backup] [--dev] [--watch] [--label <text>]");
          return 2;
        }

        const zone = await resolveZone(zoneName);
        if (!zone) {
          onLine(`✗ zone not found: "${zoneName}"`);
          return 1;
        }

        const wantsBackup = args.includes("--db-backup");
        const wantsDev = args.includes("--dev");
        const wantsWatch = args.includes("--watch");
        const label = argValue(args, "--label") ?? `preflight edit ${zone.key}`;
        const busyOps = ipcStateRef.current.bgOps.filter((op) => op.busy && !op.dismissable);

        onLine("UNAXIS preflight edit");
        onLine(`  zone  : ${zone.key} (${zone.label})`);
        onLine(`  domain: ${zone.domain}`);
        onLine("✓ TUI session attached");

        let session = getActiveWatch();
        let createdWatch = false;
        if (wantsWatch && !session) {
          const mode: WatchMode = wantsBackup ? "risky" : (wantsDev ? "dev" : "light");
          session = beginWatch({ label, mode, zone: zone.key });
          createdWatch = true;
          onLine(`✓ watch started: ${session.id}`);
        } else if (session) {
          onLine(`✓ watch active: ${session.id}`);
        } else {
          onLine("○ watch not requested");
        }

        if (session) {
          appendTimeline(session, "preflight.edit.start", {
            zone: zone.key,
            dbBackup: wantsBackup,
            dev: wantsDev,
            createdWatch,
          });
        }

        if (busyOps.length > 0) {
          onLine(`✗ stack busy: ${busyOps.length} running operation${busyOps.length !== 1 ? "s" : ""}`);
          for (const op of busyOps.slice(0, 3)) onLine(`  #${op.id} ${op.title}`);
          if (session) appendTimeline(session, "preflight.edit.end", { zone: zone.key, exitCode: 1, reason: "stack busy" });
          return 1;
        }
        onLine("✓ stack clear");

        const snapshot = await takeSessionSnapshot(`preflight edit ${zone.key}`);
        if (session) {
          const file = `preflight-edit-${Date.now()}.txt`;
          writeWatchText(session, file, snapshot);
          appendTimeline(session, "snapshot", { reason: "preflight edit", file });
          onLine(`✓ snapshot recorded: ${file}`);
        } else {
          onLine("✓ snapshot captured");
        }

        await printZoneStatus(zone, (line) => {
          if (!line.startsWith("✓")) onLine(line);
        });

        if (wantsBackup) {
          const reason = `preflight edit ${zone.key}`;
          onLine("• DB backup requested");
          if (session) appendTimeline(session, "db.backup.start", { reason, zone: zone.key });
          const lines: string[] = [];
          const code = await backupDatabase((line) => {
            lines.push(line);
            onLine(line);
          });
          if (session) {
            appendWatchText(session, "backups.txt", `# ${new Date().toISOString()} ${reason}\n${lines.join("\n")}\n`);
            appendTimeline(session, "db.backup.end", { reason, zone: zone.key, exitCode: code });
          }
          if (code !== 0) {
            if (session) appendTimeline(session, "preflight.edit.end", { zone: zone.key, exitCode: code });
            return code;
          }
        } else {
          onLine("○ DB backup skipped");
        }

        if (wantsDev) {
          if (await isDevRunning(zone)) {
            onLine(`✓ dev server already running for ${zone.label}`);
          } else {
            if (session) appendTimeline(session, "zone.dev.start", { zone: zone.key, container: devContainerName(zone) });
            const code = await startDevContainer(zone, onLine);
            if (session) appendTimeline(session, "zone.dev.end", { zone: zone.key, container: devContainerName(zone), exitCode: code });
            if (code !== 0) {
              if (session) appendTimeline(session, "preflight.edit.end", { zone: zone.key, exitCode: code });
              return code;
            }
          }
        } else {
          onLine("○ dev start skipped");
        }

        onLine("✓ preflight ready");
        onLine(`  edit zone : ${zone.key}`);
        onLine(`  live URL  : https://${zone.domain}`);
        if (wantsDev) onLine(`  dev logs  : docker logs -f ${devContainerName(zone)}`);
        if (session) appendTimeline(session, "preflight.edit.end", { zone: zone.key, exitCode: 0 });
        return 0;
      },

      // unaxis zones [--json]
      zones: async (args, onLine) => {
        const all = await loadZones();
        let footerPins = new Map<string, boolean>();
        let footerPinError: string | null = null;
        try {
          footerPins = await fetchZoneFooterPins();
        } catch (error) {
          footerPinError = error instanceof Error ? error.message : String(error);
        }

        if (args.includes("--json")) {
          onLine(JSON.stringify(
            all.map((zone) => ({
              ...zone,
              footerPinned: footerPins.get(zone.key) === true,
              footerTagKnown: footerPins.has(zone.key),
            })),
            null,
            2,
          ));
          return 0;
        }
        if (all.length === 0) { onLine("  (no zones)"); return 0; }
        for (const z of all) {
          const footerTag = footerPins.get(z.key) === true ? "tagged" : "not tagged";
          onLine(`  ${z.key.padEnd(20)} ${z.label.padEnd(20)} ${z.domain.padEnd(30)} ${footerTag}`);
        }
        if (footerPinError) onLine(`  tag state unavailable: ${footerPinError}`);
        return 0;
      },

      // unaxis zone <name> status
      // unaxis zone <name> tag|untag|pinned
      // unaxis zone <name> disable   (soft: stop container, drop from compose
      //                               + proxy route, keep source — for zones
      //                               served externally, e.g. Vercel)
      // unaxis zone <name> enable    (undo disable; re-add to compose + proxy,
      //                               still needs a manual `build` after)
      // unaxis zone <name> hosting [docker|vercel]  (read/set hosting mode —
      //                               vercel zones' "build" pushes to git,
      //                               skips Docker entirely)
      // unaxis zone <name> logs [--tail <lines>]
      // unaxis zone <name> dev start|stop|restart|secure
      // unaxis zone <name> dev logs [--tail <lines>]
      zone: async (args, onLine) => {
        const zoneName = args[0];
        if (!zoneName) { onLine(`✗ usage: ${ZONE_FOOTER_PIN_USAGE}`); return 2; }

        // ── create: scaffold a NEW zone (headless equivalent of the TUI wizard) ──
        // unaxis zone <key> create [--layout app|landing|shop|minimal] [--footer none|shop|landing] [--label "Name"]
        // Runs the same deriveZone + createZonePipeline the wizard uses, backgrounded
        // (the pipeline is multi-minute: scaffold → build → deploy → proxy → NPM cert),
        // so it returns "queued" immediately and is watchable via `unaxis stacks`.
        if (args[1] === "create") {
          if (!/^[a-z0-9-]+$/.test(zoneName)) {
            onLine("✗ invalid zone key — lowercase letters, numbers, hyphens only"); return 2;
          }
          if (await resolveZone(zoneName)) { onLine(`✗ zone "${zoneName}" already exists`); return 1; }
          const layout = (argValue(args, "--layout") ?? "app") as LayoutType;
          if (!LAYOUT_OPTIONS.some((o) => o.type === layout)) {
            onLine("✗ invalid --layout — one of: landing | shop | app | minimal"); return 2;
          }
          const footer = (argValue(args, "--footer") ?? "none") as AppFooterType;
          const label  = argValue(args, "--label") ?? (zoneName.charAt(0).toUpperCase() + zoneName.slice(1));
          const port   = await findNextDevPort();
          const z = deriveZone(
            { key: zoneName, label, layoutType: layout, appFooter: footer, dynamicSections: [] },
            port,
          );
          runOpQueued(`Create  ${z.label}`, (l) => createZonePipeline(z, l));
          if (args.includes("--json")) {
            onLine(JSON.stringify({ status: "queued", taskId: `Create  ${z.label}`, key: z.key, domain: z.domain, layout, footer }));
          } else {
            onLine(`⚡ Creating ${z.label} → ${z.domain} (layout: ${layout}${layout === "app" ? `, footer: ${footer}` : ""}) — watch: unaxis stacks`);
          }
          return 3;
        }

        const zone = await resolveZone(zoneName);
        if (!zone) { onLine(`✗ zone not found: "${zoneName}"`); return 1; }

        const action = args[1] ?? "status";
        if (action === "status") {
          return printZoneStatus(zone, onLine);
        }

        if (action === "pinned" || action === "tagged") {
          try {
            return await printZoneFooterPinStatus(zone, onLine);
          } catch (error) {
            onLine(`✗ ${error instanceof Error ? error.message : String(error)}`);
            return 1;
          }
        }

        if (action === "pin" || action === "tag") {
          try {
            const row = await setZoneFooterPinned(zone.key, true);
            onLine(`✓ ${row.label} tagged for public footer`);
            onLine(`  ${row.domain}`);
            return 0;
          } catch (error) {
            onLine(`✗ ${error instanceof Error ? error.message : String(error)}`);
            return 1;
          }
        }

        if (action === "unpin" || action === "untag" || action === "untage") {
          try {
            const row = await setZoneFooterPinned(zone.key, false);
            onLine(`✓ ${row.label} removed from public footer`);
            onLine(`  ${row.domain}`);
            return 0;
          } catch (error) {
            onLine(`✗ ${error instanceof Error ? error.message : String(error)}`);
            return 1;
          }
        }

        // ── Public visibility (Sites & Apps) ──────────────────────────────
        // `public` → visibility=public, `private` → private, `unlisted` →
        // unlisted, `visibility` → read current. Separate from footer tag/pin.
        if (action === "public" || action === "private" || action === "unlisted") {
          try {
            const row = await setZoneVisibility(zone.key, action as ZoneVisibility);
            onLine(`✓ ${row.label} is now ${row.visibility}`);
            onLine(`  ${row.domain}`);
            return 0;
          } catch (error) {
            onLine(`✗ ${error instanceof Error ? error.message : String(error)}`);
            return 1;
          }
        }

        if (action === "visibility") {
          try {
            const row = await fetchZoneVisibility(zone.key);
            if (!row) { onLine(`✗ zone not found in catalog: ${zone.key}`); return 1; }
            onLine(`  ${row.label}  ·  ${row.domain}`);
            onLine(`  visibility : ${row.visibility}`);
            return 0;
          } catch (error) {
            onLine(`✗ ${error instanceof Error ? error.message : String(error)}`);
            return 1;
          }
        }

        // ── Soft disable/enable — pull a zone out of the Docker lifecycle ────
        // without deleting its source. Stops + removes the container, drops
        // it from the shared compose sync (enabled=0 → dbGetZones excludes
        // it, so it never spins back up on a POWER/Docker restart), and
        // removes its proxy route. Unlike `delete`, zones/{key}/ and
        // src/zones/{key}/ are left untouched — for a zone that's meant to
        // be served externally (e.g. Vercel) but still wants its source
        // scaffolded from the same template.
        if (action === "disable") {
          try {
            await removeZoneDockerArtifacts(zone.key, zone.container, zone.image, onLine);
            removeZone(zone.key, true);
            onLine(`✓ Marked disabled in control-db (SQLite)`);
            await syncSharedZonesCompose(onLine);
            await removeZoneRoute(zone.key, onLine);
            await deleteZoneNpmHost(zone.key, onLine);
            onLine("");
            onLine(`✓ Zone "${zone.key}" disabled — source kept, won't rebuild/redeploy/spin up until re-enabled`);
            return 0;
          } catch (error) {
            onLine(`✗ ${error instanceof Error ? error.message : String(error)}`);
            return 1;
          }
        }

        if (action === "enable") {
          try {
            restoreZone(zone.key);
            onLine(`✓ Marked enabled in control-db (SQLite)`);
            await syncSharedZonesCompose(onLine);
            await addZoneRoute(zone.key, `http://${zone.service}:3000`, onLine);
            onLine("");
            onLine(`✓ Zone "${zone.key}" enabled — run "unaxis zone ${zone.key} build" to bring it back up`);
            return 0;
          } catch (error) {
            onLine(`✗ ${error instanceof Error ? error.message : String(error)}`);
            return 1;
          }
        }

        // unaxis zone <name> hosting              — read current hosting mode
        // unaxis zone <name> hosting docker|vercel — set it
        if (action === "hosting") {
          const requested = args[2];
          if (!requested) {
            onLine(`  ${zone.label}  hosting: ${zone.hosting ?? "docker"}`);
            return 0;
          }
          if (requested !== "docker" && requested !== "vercel") {
            onLine(`✗ usage: unaxis zone ${zone.key} hosting docker|vercel`);
            return 2;
          }
          try {
            setZoneHosting(zone.key, requested);
            onLine(`✓ ${zone.label} hosting set to "${requested}"`);
            if (requested === "vercel") {
              onLine(`  "unaxis zone ${zone.key} build" now pushes source to git instead of building Docker`);
            }
            return 0;
          } catch (error) {
            onLine(`✗ ${error instanceof Error ? error.message : String(error)}`);
            return 1;
          }
        }

        if (action === "logs") {
          const tail = parseTail(args.slice(2));
          const result = await captureDockerLogs({
            label: zone.key,
            container: zone.container,
            tail,
          }, onLine);
          if (result.code === 0) onLine(`✓ zone logs: ${zone.key} (${result.tail} lines)`);
          return result.code;
        }

        if (action === "promote") {
          if (zone.hosting !== "vercel") {
            onLine(`✗ ${zone.label} is Docker-hosted; promote is only for Vercel zones.`);
            return 2;
          }
          const deploymentUrl = args[2];
          if (!deploymentUrl) {
            onLine(`✗ usage: unaxis zone ${zone.key} promote https://<deployment>.vercel.app [--bg]`);
            return 2;
          }
          const runner = (line: (value: string) => void) => promoteVercelZone(zone, deploymentUrl, line);
          if (args.includes("--bg")) {
            runOpQueued(`Promote  ${zone.label}`, runner);
            onLine(`⚡ Promote ${zone.label} queued — watch: unaxis stacks`);
            return 3;
          }
          return runOpVisible(`Promote  ${zone.label}`, runner, onLine);
        }

        if (action === "build" || action === "rebuild") {
          const noCache = action === "rebuild" || args.includes("--no-cache");
          // --ref <branch|tag|sha>: build that exact forge commit from a clean
          // checkout instead of the dev drive (see build-ref.ts).
          const ref = argValue(args, "--ref");
          const verb = `${noCache ? "Rebuild" : "Build"}${ref ? ` @${ref}` : ""}`;

          // Vercel-hosted zones skip Docker entirely: "build" is a scoped
          // git add+commit+push of the zone's own source. An external
          // Vercel project (Root Directory scoped to this zone, watching
          // the same repo) builds and deploys on its own from that push.
          if (zone.hosting === "vercel") {
            const runner = (l: (line: string) => void) => gitCommitAndPushZone(zone, l);
            if (args.includes("--bg")) {
              runOpQueued(`Push  ${zone.label}`, runner);
              if (args.includes("--json")) onLine(JSON.stringify({ status: "queued", taskId: `Push  ${zone.label}` }));
              else onLine(`⚡ ${zone.label} (vercel-hosted) — pushing to git — watch: unaxis stacks`);
              return 3;
            }
            return runOpVisible(`Push  ${zone.label}`, runner, onLine);
          }

          // --bg: enqueue as a TUI stack op and return immediately (no socket
          // wait). Lets the operator fire several zone builds concurrently and
          // watch them via `unaxis stacks` instead of blocking for ~5 min.
          if (args.includes("--bg")) {
            runOpQueued(`${verb}  ${zone.label}`, (bgLine) => buildAndDeploy(zone, bgLine, { noCache, ref }));
            if (args.includes("--json")) onLine(JSON.stringify({ status: "queued", taskId: `${verb}  ${zone.label}` }));
            else onLine(`⚡ ${verb} ${zone.label} queued — watch: unaxis stacks`);
            return 3;
          }
          // Foreground build still blocks + returns the exit code to the IPC
          // caller, but now ALSO appears in the human's stack (tees to both).
          return runOpVisible(`${verb}  ${zone.label}`, (l) => buildAndDeploy(zone, l, { noCache, ref }), onLine);
        }

        // move <env>: deploy the zone on another host, then retire the old container.
        if (action === "move") {
          const target = args.find((a, i) => i > 1 && !a.startsWith("--") && args[i - 1] !== "--ref");
          if (!target) { onLine("✗ usage: zone <key> move <env> [--ref <ref>] [--bg]"); return 2; }
          if (zone.hosting === "vercel") { onLine(`✗ ${zone.label} is vercel-hosted — nothing to move`); return 1; }
          const ref = argValue(args, "--ref");
          const { moveZone } = await import("../zone-move.ts");
          const runner = (l: (line: string) => void) => moveZone(zone, target, l, { ref });
          if (args.includes("--bg")) {
            runOpQueued(`Move  ${zone.label} → ${target}`, runner);
            onLine(`⚡ Move ${zone.label} → ${target} queued — watch: unaxis stacks`);
            return 3;
          }
          return runOpVisible(`Move  ${zone.label} → ${target}`, runner, onLine);
        }

        if (action === "deploy") {
          if (zone.hosting === "vercel") {
            onLine(`✗ ${zone.label} is vercel-hosted — there's no Docker container to deploy. Use "build" to push source instead.`);
            return 1;
          }
          if (args.includes("--bg")) {
            runOpQueued(`Deploy  ${zone.label}`, async (bgLine) => deployZone(zone, bgLine));
            if (args.includes("--json")) onLine(JSON.stringify({ status: "queued", taskId: `Deploy  ${zone.label}` }));
            else onLine(`⚡ Deploy ${zone.label} queued — watch: unaxis stacks`);
            return 3;
          }
          return runOpVisible(`Deploy  ${zone.label}`, (l) => deployZone(zone, l), onLine);
        }

        if (action === "pull") {
          if (args.includes("--bg")) {
            runOpQueued(`Pull + up  ${zone.label}`, async (bgLine) => pullAndUp(zone, bgLine));
            if (args.includes("--json")) onLine(JSON.stringify({ status: "queued", taskId: `Pull + up  ${zone.label}` }));
            else onLine(`⚡ Pull ${zone.label} queued — watch: unaxis stacks`);
            return 3;
          }
          return runOpVisible(`Pull + up  ${zone.label}`, (l) => pullAndUp(zone, l), onLine);
        }

        if (action === "delete") {
          if (!args.includes("--confirm")) {
            onLine(`✗ Destructive operation — pass --confirm to proceed`);
            onLine(`  unaxis zone ${zone.key} delete --confirm`);
            return 2;
          }
          if (zone.key === "unenter" || zone.key === "proxy") {
            onLine(`✗ ${zone.label} is permanent infrastructure — cannot be deleted`);
            return 1;
          }
          onLine(`Deleting zone  ${zone.label}…`);
          const { exitCode } = await deleteZone(zone, onLine);
          if (exitCode === 0) onLine(`✓ Zone "${zone.key}" deleted`);
          return exitCode;
        }

        if (action === "doctor") {
          onLine(`Diagnosing ${zone.label}…`);
          onLine(`--- compose ---`);
          const changed = doctorComposeService(zone, onLine);
          onLine(changed ? `  compose patched` : `  compose OK`);
          onLine(`--- proxy routes ---`);
          const [doctorEnvs] = await Promise.all([loadEnvironments()]);
          const doctorEnvById = new Map(doctorEnvs.map((e) => [e.id, e]));
          const doctorEnv = zone.environmentId ? (doctorEnvById.get(zone.environmentId) ?? null) : null;
          const { deriveZoneUpstream: dzUpstream } = await import("../proxy-config.js");
          const routes = getRoutes();
          const correctUpstream = dzUpstream(zone, doctorEnv);
          if (routes.zones?.[zone.key] === correctUpstream) {
            onLine(`✓ proxy route OK  →  ${zone.domain}  →  ${correctUpstream}`);
          } else {
            await addZoneRoute(zone.key, correctUpstream, onLine);
          }
          onLine(`--- NPM ---`);
          await npmAddZone(zone, onLine, doctorEnv);
          return 0;
        }

        if (action !== "dev") {
          onLine(`✗ unknown zone action: ${action}`);
          onLine(`  usage: ${ZONE_FOOTER_PIN_USAGE}`);
          return 2;
        }

        const verb = args[2];
        if (!verb || !["start", "stop", "restart", "logs", "secure"].includes(verb)) {
          onLine("✗ usage: zone <zone-key> dev <start|stop|restart|logs|secure>");
          return 2;
        }

        if (verb === "secure") {
          return npmSecureDevHost(devDomain(zone), onLine);
        }

        if (verb === "logs") {
          const tail = parseTail(args.slice(3));
          const { bareDevConfig, bareDevLogTail } = await import("../bare-dev.ts");
          if (bareDevConfig(zone) && !(await getStatus(devContainerName(zone))).startsWith("run")) {
            const lines = bareDevLogTail(zone, tail);
            lines.forEach((l) => onLine(l));
            onLine(`✓ zone dev logs: ${zone.key} (${lines.length} lines, bare metal)`);
            return 0;
          }
          const container = devContainerName(zone);
          const result = await captureDockerLogs({
            label: `${zone.key}-dev`,
            container,
            tail,
          }, onLine);
          if (result.code === 0) onLine(`✓ zone dev logs: ${zone.key} (${result.tail} lines)`);
          return result.code;
        }

        if (verb === "start") {
          if (await isDevRunning(zone)) {
            onLine(`✓ dev server already running for ${zone.label}`);
            return 0;
          }
          // --container: the old Docker dev container instead of bare metal.
          return startDevContainer(zone, onLine, { container: args.includes("--container") });
        }

        if (verb === "stop") {
          return stopDevContainer(zone, onLine);
        }

        onLine(`Restarting dev container for ${zone.label}…`);
        const stopCode = await stopDevContainer(zone, onLine);
        if (stopCode !== 0) return stopCode;
        return startDevContainer(zone, onLine);
      },

      // unaxis status  — confirm TUI is alive
      status: async (_args, onLine) => {
        // Detect version + mode — UNAXIS_VERSION is only injected in prod builds
        let version = "dev";
        let mode    = "dev";
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const v = (globalThis as any).UNAXIS_VERSION ?? UNAXIS_VERSION;
          if (typeof v === "string" && v) { version = v; mode = "prod"; }
        } catch { /* running from source — dev mode */ }

        const uptimeSec = Math.floor(process.uptime());
        const uptimeStr = uptimeSec < 60
          ? `${uptimeSec}s`
          : uptimeSec < 3600
            ? `${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`
            : `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m`;

        onLine(`✓ UNAXIS TUI is running`);
        onLine(`  version  ${version}`);
        onLine(`  mode     ${mode}`);
        onLine(`  uptime   ${uptimeStr}`);
        onLine(`  pid      ${process.pid}`);
        return 0;
      },

      // unaxis logs proxy|db|npm [--tail <lines>]
      logs: async (args, onLine) => {
        const target = args[0];
        if (!target || !["proxy", "db", "npm", "router"].includes(target)) {
          onLine("✗ usage: logs proxy|db|npm [--tail <lines>]");
          onLine("         logs router [--tail <lines>] [--grep <regex>] [--date YYYY-MM-DD | --days <n>]");
          return 2;
        }

        // ── logs router — remote syslog files kept by the `syslog` service ──────
        // Network gear (the router) logs to this host; history survives the
        // router's own few-minute buffer. Files are per UTC day.
        if (target === "router") {
          const { readRouterLog, parseRouterLogArgs, routerLogDir } = await import("../router-log.ts");
          const { PROJECT_DIR } = await import("../../config/stack.ts");
          const q = parseRouterLogArgs(args.slice(1), parseTail(args.slice(1)));
          if (typeof q === "string") { onLine(`✗ ${q}`); return 2; }
          const dir = routerLogDir(PROJECT_DIR);
          const { lines, days } = readRouterLog(dir, q);
          if (days.length === 0) {
            onLine(`✗ no syslog files in ${dir}`);
            onLine("  Is the syslog service up, and is the router's Remote Log Server set to this host, port 5514?");
            return 1;
          }
          lines.forEach(onLine);
          onLine(`✓ router log: ${lines.length} line(s) from ${days.join(", ")} (UTC)`);
          return 0;
        }

        // ── logs npm — fetch nginx-proxy-manager logs via the environment agent ──
        // Uses the same agent pathway as `env containers`, not SSH.
        // Finds the environment whose agentUrl matches NPM_HOST.ip, so this
        // stays correct if NPM moves to a different machine.
        if (target === "npm") {
          const tail = parseTail(args.slice(1));
          const npmIp = NPM_HOST.ip;
          const envs  = await loadEnvironments();
          const npmEnv = envs.find((e) => e.agentUrl?.includes(npmIp));
          if (!npmEnv) {
            onLine(`✗ No environment agent found at ${npmIp}`);
            onLine(`  Register the NPM host as an environment with an agent URL — see: env list`);
            return 1;
          }
          onLine(`Logs  npm  (nginx-proxy-manager @ ${npmEnv.name})  tail ${tail}`);
          const text = await fetchContainerLogs(npmEnv, "nginx-proxy-manager", tail);
          if (text === null) {
            onLine(`✗ Could not reach agent on ${npmEnv.name} (${npmEnv.agentUrl})`);
            return 1;
          }
          text.split("\n").filter(Boolean).forEach(onLine);
          onLine(`✓ npm logs (${tail} lines)`);
          return 0;
        }

        // ── logs proxy|db — local docker container ───────────────────────────────
        const tail = parseTail(args.slice(1));
        const container = target === "proxy" ? PROXY.container : "unt_db";
        const result = await captureDockerLogs({
          label: target,
          container,
          tail,
        }, onLine);
        if (result.code === 0) onLine(`✓ ${target} logs (${result.tail} lines)`);
        return result.code;
      },

      // ── unaxis snap [--save] [--label <name>] [--json] ───────────────────
      // Captures the current live TUI screen — whatever the user sees right now.
      // Reads frontFrame from the running Ink instance. Dev mode is tagged.
      snap: async (args, onLine) => {
        const save     = args.includes("--save");
        const asJson   = args.includes("--json");
        const labelIdx = args.indexOf("--label");
        const label    = labelIdx >= 0 ? (args[labelIdx + 1] ?? "snap") : "snap";

        const instances = (await import("../instances.js")).default;
        const { cellAt } = await import("../screen.js");

        const ink   = instances.get(process.stdout);
        const frame = ink?.lastFrame();
        const screen = frame?.screen;

        if (!screen) {
          onLine("✗ no live frame available");
          return 1;
        }

        // Read screen cells row by row
        const rows: string[] = [];
        for (let y = 0; y < screen.height; y++) {
          let row = "";
          for (let x = 0; x < screen.width; x++) {
            row += cellAt(screen, x, y)?.char ?? " ";
          }
          rows.push(row.trimEnd());
        }
        while (rows.length > 0 && rows[rows.length - 1] === "") rows.pop();
        const text = rows.join("\n");

        const isDev  = process.execPath.toLowerCase().includes("bun");
        const mode   = isDev ? "dev" : "prod";
        const { view } = ipcStateRef.current;

        const metadata = {
          label,
          mode,
          view,
          width:     screen.width,
          height:    screen.height,
          lines:     rows.length,
          timestamp: new Date().toISOString(),
        };

        if (asJson) {
          onLine(JSON.stringify({ text, metadata }, null, 2));
          return 0;
        }

        onLine(`\n── snap: ${view} [${mode}] ${"─".repeat(Math.max(0, 60 - view.length))}`);
        onLine(text);
        onLine("─".repeat(70));
        onLine(`  ${rows.length} lines · ${screen.width}×${screen.height} · ${mode}`);

        if (save) {
          const { writeSnapshot } = await import("../../agent-view/writeSnapshot.js");
          const snap = await writeSnapshot({
            text,
            ansi: "",
            lines: rows,
            metadata: { label: `${label}-${mode}`, componentName: view, width: screen.width, height: screen.height, renderMs: 0, timestamp: metadata.timestamp },
          });
          onLine(`  saved → ${snap.dir}`);
        }

        return 0;
      },

      // ── unaxis notify <message> [--type success|error|info] [--priority low|medium|high|immediate] [--timeout <ms>] [--key <key>] ──
      // Push a notification into the running TUI from outside — CLI, agents, scripts.
      notify: async (args, onLine) => {
        const message = args[0];
        if (!message) {
          onLine("✗ usage: notify <message> [--type success|error|info] [--priority low|medium|high|immediate] [--timeout <ms>] [--key <key>]");
          return 2;
        }

        const VALID_TYPES     = ["success", "error", "info"] as const;
        const VALID_PRIORITIES = ["low", "medium", "high", "immediate"] as const;

        const typeIdx     = args.indexOf("--type");
        const prioIdx     = args.indexOf("--priority");
        const timeoutIdx  = args.indexOf("--timeout");
        const keyIdx      = args.indexOf("--key");

        const rawType     = typeIdx     >= 0 ? args[typeIdx + 1]     : undefined;
        const rawPriority = prioIdx     >= 0 ? args[prioIdx + 1]     : undefined;
        const rawTimeout  = timeoutIdx  >= 0 ? args[timeoutIdx + 1]  : undefined;
        const rawKey      = keyIdx      >= 0 ? args[keyIdx + 1]      : undefined;

        const type: NotificationType = (VALID_TYPES as readonly string[]).includes(rawType ?? "")
          ? (rawType as NotificationType) : "info";

        const priority: NotificationPriority = (VALID_PRIORITIES as readonly string[]).includes(rawPriority ?? "")
          ? (rawPriority as NotificationPriority) : "medium";

        const timeoutMs = rawTimeout ? parseInt(rawTimeout, 10) : undefined;
        const key       = rawKey ?? undefined;

        const opts: NotificationOptions = {
          priority,
          ...(timeoutMs && !isNaN(timeoutMs) ? { timeoutMs } : {}),
          ...(key ? { key } : {}),
        };

        addNotificationRef.current(message, type, opts);

        onLine(`✓ notification sent: "${message}" [${type}/${priority}]${key ? ` key=${key}` : ""}`);
        return 0;
      },

      // ── unaxis snapshot-view <panel> [--save] [--label <name>] [--json] ──
      // Renders any Ink panel directly to a text frame. No TUI launch.
      // ~25ms. Loading/empty state is fine — shows full UI chrome and layout.
      //
      // Panels: npm, infra, infra-dns, infra-ports, zones, db, env
      "snapshot-view": async (args, onLine) => {
        const target   = args[0] ?? "npm";
        const save     = args.includes("--save");
        const asJson   = args.includes("--json");
        const labelIdx = args.indexOf("--label");
        const label    = labelIdx >= 0 ? (args[labelIdx + 1] ?? target) : target;

        const rowsIdx  = args.indexOf("--rows");
        const rowsVal  = rowsIdx >= 0 ? parseInt(args[rowsIdx + 1] ?? "40", 10) : 40;
        const colsIdx  = args.indexOf("--cols");
        const colsVal  = colsIdx >= 0 ? parseInt(args[colsIdx + 1] ?? "120", 10) : 120;

        const { renderPanelFrame } = await import("../../agent-view/renderPanelFrame.js");
        const React = (await import("../reactRuntime.js")).default;
        const noop  = () => {};

        // ── Build element for the requested panel ──────────────────────────
        let element: React.ReactElement | null = null;
        let componentName = "";

        if (target === "npm") {
          const { NpmPanel } = await import("../panels/Npm/index.js");
          const { npmGetStatus, npmListHosts } = await import("../npm/index.js");
          componentName = "NpmPanel";
          // Prefetch live host data so the panel renders with real content,
          // not a "loading…" state.  Fall back to empty list on any error.
          let initialHosts;
          try {
            const status = await npmGetStatus();
            if (status.status === "connected" && status.token) {
              initialHosts = await npmListHosts(status.token);
            }
          } catch { /* snapshot still renders chrome without data */ }
          element = React.createElement(NpmPanel, { onCopy: noop, onGoBack: noop, initialHosts });

        } else if (target.startsWith("infra")) {
          const { InfraPanel } = await import("../panels/Infra/index.js");
          componentName = "InfraPanel";
          element = React.createElement(InfraPanel, {
            activeEnv: null, infraSource: null, results: {},
            checking: false, onCheckInfra: noop, onGoBack: noop,
          });

        } else if (target === "zones") {
          const { ZonesPanel } = await import("../panels/Zones/index.js");
          componentName = "ZonesPanel";
          element = React.createElement(ZonesPanel, {
            zones: [], zoneStatuses: {}, selected: 0,
            emptyMessage: "No zones — snapshot view",
          });

        } else if (target === "db") {
          const { DbPanel } = await import("../panels/Db/index.js");
          componentName = "DbPanel";
          const dbNoop = { onLogs: noop, onBackup: noop, onCopy: noop,
            onStart: noop, onStop: noop, onRestart: noop, onHeal: noop,
            onVerify: noop, onNewInstance: noop, onRestore: noop,
            onCloneFromSnapshot: noop, onInstanceAction: noop,
            onGoBack: noop, onSubCrumbs: noop };
          element = React.createElement(DbPanel, dbNoop);

        } else if (target === "env") {
          const { EnvPanel } = await import("../panels/Env/index.js");
          const { loadEnvironments } = await import("../environment-store.js");
          componentName = "EnvPanel";
          // Prefetch environments so the panel renders with real node cards.
          let initialEnvs;
          try {
            initialEnvs = await loadEnvironments(false);
          } catch { /* snapshot still renders chrome without data */ }
          element = React.createElement(EnvPanel, {
            onGoBack: noop, addNotification: noop, initialEnvs,
          });

        } else if (target === "startup") {
          const { StartupScreen } = await import("../components/StartupScreen.js");
          componentName = "StartupScreen";
          element = React.createElement(StartupScreen, { onDone: noop, onQuit: noop, instant: true });

        } else if (target === "welcome") {
          const { WelcomeScreen } = await import("../../screens/WelcomeScreen.js");
          componentName = "WelcomeScreen";
          element = React.createElement(WelcomeScreen, {
            zones: [], zoneStatuses: {}, proxyStatus: "running",
            isActive: true, onManage: noop, onSettings: noop,
            onQuit: noop, onRelease: noop, onBuild: noop,
          });

        } else if (target === "settings") {
          const { SettingsScreen } = await import("../../screens/SettingsScreen.js");
          componentName = "SettingsScreen";
          element = React.createElement(SettingsScreen, {
            zones: [], onTokenEditStart: noop, onTokenEditEnd: noop,
          });

        } else {
          onLine(`✗ unknown target: ${target}`);
          onLine(`  panels:  npm, infra, infra-dns, infra-ports, zones, db, env`);
          onLine(`  screens: startup, welcome, settings`);
          return 2;
        }

        const result = await renderPanelFrame(label, element, componentName, { columns: colsVal, rows: rowsVal });

        if (asJson) {
          onLine(JSON.stringify(result, null, 2));
          return 0;
        }

        onLine(`\n── snapshot-view: ${target} (${componentName}) ${"─".repeat(Math.max(0, 50 - target.length))}`);
        onLine(result.text);
        onLine(`─`.repeat(70));
        onLine(`  ${result.metadata.renderMs}ms · ${result.lines.length} lines · ${result.metadata.width}×${result.metadata.height}`);

        if (save) {
          const { writeSnapshot } = await import("../../agent-view/writeSnapshot.js");
          const snap = await writeSnapshot(result);
          onLine(`  saved → ${snap.dir}`);
        }

        return 0;
      },
    });

    // Remote bridge removed — IPC server now binds 0.0.0.0 directly.
    // Prod TUI: port 50505. Dev TUI: port 50507. No auth, no pairing keys.

    return () => { server.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Proxy reconciliation on startup ───────────────────────────────────────
  // SQLite control-db is the source of truth for zones and environments.
  // On every TUI boot, rebuild routes.json so the proxy is always correct:
  //   - local zones → container-name DNS (same bridge)
  //   - remote zones → host IP derived from zone.environmentId
  useEffect(() => {
    Promise.all([loadZones(), loadEnvironments()])
      .then(([zones, envs]) => reconcileProxyRoutes(zones, envs, (name) => getStatus(name)))
      .catch(() => { /* DB or proxy unreachable at boot — leave routes as-is */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Core stack self-heal on startup ───────────────────────────────────────
  // A PC reboot brings Docker Desktop back up, but individual containers
  // (proxy/agent especially) can come back down or half-started, and nobody
  // is around to type `unaxis up`. Run the exact same cold-start automatically
  // once per process launch, as a normal visible stack op — so a fresh TUI
  // process always finds (or brings) the stack healthy without manual docker
  // commands. Safe to run even when everything is already up: `compose up -d`
  // no-ops on running services, and hydration UPSERTs.
  useEffect(() => {
    if (autoColdStartFired) return;
    autoColdStartFired = true;
    void runOpVisible("Startup self-heal (unaxis up)", (onLine) => coldStartCoreStack(onLine, { noRecreate: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Nightly workspace backup ──────────────────────────────────────────────
  // Checks every 5 minutes; runs as a visible stack op once the scheduled time
  // has passed and today's run hasn't happened. A lock file keeps the dev and
  // prod TUIs from both running it.
  useEffect(() => {
    const tick = async () => {
      try {
        const { backupDue, runScheduledBackup } = await import("../backup-store.ts");
        if (backupDue()) void runOpVisible("Nightly backup (restic)", (onLine) => runScheduledBackup(onLine));
      } catch { /* control DB not ready yet — next tick */ }
    };
    const timer = setInterval(() => { void tick(); }, 5 * 60_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

}
