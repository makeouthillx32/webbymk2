import { useEffect, useRef } from "react";
import type { StackOp } from "../components/DetachedStack.tsx";
import type { RuntimeInstance } from "../zone/supabase-factory.ts";
import type { Zone } from "../../config/zones.ts";
import { PROXY } from "../../config/zones.ts";
import { backupDatabase, startCoreStack, stopCoreStack, restartCoreStack, removeCoreStack } from "../db-api.ts";
import { devContainerName, startDevContainer, stopDevContainer } from "../dev-container.ts";
import { getStatus } from "../docker.ts";
import { startIpcServer, startRemoteIpcBridge } from "../ipc-server.ts";
import { captureDockerLogs, parseTail } from "../log-snapshot.ts";
import { parseLogTail, snapshotContainerLogs } from "../log-snapshot.ts";
import { loadZones } from "../zone-store.ts";
import { fetchContainers, fetchContainerLogs } from "../agent-client.ts";
import { updateRemoteAgent } from "../agent-ops.ts";
import {
  loadEnvironments,
  getActiveEnvironment,
  setActiveEnvironment,
  environmentTypeLabel,
  pingAgentHealth,
  saveAgentStatus,
} from "../environment-store.ts";
import { reconcileProxyRoutes } from "../proxy-config.ts";
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
  smokeTestDatabase,
  validateDatabaseSlug,
} from "../zone/database-manager.ts";
import { loadRegistry } from "../zone/supabase-factory.ts";
import { NPM_HOST } from "../../config/stack.ts";

declare const UNAXIS_VERSION: string;

type RunOpQueued = (
  title: string,
  run: (onLine: (line: string) => void) => Promise<number> | number,
  priority?: "now" | "next" | "later",
) => void;

type UseIpcBridgeParams = {
  view: string;
  bgOps: StackOp[];
  proxyStatus: string;
  refreshEnvs: () => void | Promise<void>;
  runOpQueued: RunOpQueued;
  coreDockerInstance: RuntimeInstance;
};

export function useIpcBridge({
  view,
  bgOps,
  proxyStatus,
  refreshEnvs,
  runOpQueued,
  coreDockerInstance,
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
      const status = await getStatus(devContainerName(zone));
      if (status === "running") return "● running";
      if (status === "starting") return "◌ starting";
      return "○ stopped";
    };

    const printZoneStatus = async (zone: Zone, onLine: (line: string) => void) => {
      onLine(`${zone.label} · ${zone.domain}`);
      onLine(`  key       : ${zone.key}`);
      onLine(`  container : ${zone.container}`);
      onLine(`  dev       : ${await formatDevStatus(zone)} (${devContainerName(zone)})`);
      onLine(`✓ zone status`);
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

      // unaxis version  — TUI version + live agent ping on every registered environment
      // Returns package version immediately, then pings agents concurrently.
      // Offline fallback is handled in cli.tsx (prints pkg version if TUI is down).
      version: async (_args, onLine) => {
        onLine(`\nUNAXIS  ${UNAXIS_VERSION}\n`);
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
        const status = await getStatus(devContainerName(zone));
        if (status === "running" || status === "starting") {
          onLine(`Stopping dev container for ${zone.label}…`);
          return stopDevContainer(zone, onLine);
        }
        onLine(`Starting dev container for ${zone.label}…`);
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

        // unaxis env stacks [<name>]
        // Groups containers by com.docker.compose.project label — no extra agent
        // endpoint needed, derived from the same fetchContainers data.
        if (sub === "stacks") {
          const nameArg = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
          const all     = await loadEnvironments();
          const env     = nameArg
            ? all.find((e) => e.name.toLowerCase() === nameArg.toLowerCase())
            : all.find((e) => e.isDefaultTarget) ?? all[0];
          if (!env) {
            onLine(nameArg ? `✗ environment not found: "${nameArg}"` : "✗ no environments configured");
            return 1;
          }
          if (!env.agentUrl) { onLine(`✗ ${env.name} has no agent configured`); return 1; }
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
          const nameArg    = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
          const all        = await loadEnvironments();

          let env = nameArg
            ? all.find((e) => e.name.toLowerCase() === nameArg.toLowerCase())
            : all.find((e) => e.isDefaultTarget) ?? all[0];

          if (!env) {
            onLine(nameArg
              ? `✗ environment not found: "${nameArg}"`
              : "✗ no environments configured");
            return 1;
          }
          if (!env.agentUrl) {
            onLine(`✗ ${env.name} has no agent configured`);
            return 1;
          }

          onLine(`Fetching containers on ${env.name} (${env.agentUrl})…`);
          const containers = await fetchContainers(env);
          if (!containers) {
            onLine(`✗ Could not reach agent — is ${env.name} online?`);
            return 1;
          }

          const visible = showAll
            ? containers
            : containers.filter((c) => c.Names.some((n) => n.replace(/^\//, "").startsWith("unt_")));

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

        onLine(`✗ unknown env command: "${sub}"`);
        onLine("  usage: env list | env ping [<name>] | env containers [<name>] [--all] | env stacks [<name>] | env logs <env> <container> [--tail <n>] | env update <name> | env status | env use <name>");
        return 2;
      },

      // unaxis session  — agent-friendly snapshot of the attached TUI
      session: async (_args, onLine) => {
        const [all, activeEnv] = await Promise.all([loadZones(), getActiveEnvironment()]);
        const { view: currentView, bgOps: currentOps, proxyStatus: currentProxy } = ipcStateRef.current;
        const running = currentOps.filter((o) => o.busy && !o.dismissable).length;
        const live = currentOps.filter((o) => o.busy && o.dismissable).length;
        const done = currentOps.filter((o) => !o.busy).length;
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
      stack: async (_args, onLine) => {
        const ops = ipcStateRef.current.bgOps;
        if (ops.length === 0) { onLine("✓ stack empty"); return 0; }
        for (const op of ops) {
          const state = op.busy ? (op.dismissable ? "live" : "running") : "done";
          const last = op.lines[op.lines.length - 1];
          onLine(`  #${op.id} ${state.padEnd(7)} ${op.title}${last ? ` · ${last}` : ""}`);
        }
        onLine(`✓ ${ops.length} stack item${ops.length !== 1 ? "s" : ""}`);
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
          if (registry.length === 0) { onLine("  (no runtime instances)"); return 0; }
          for (const inst of registry) {
            const p = inst.ports;
            onLine(`  ${inst.name.padEnd(24)} ${inst.slug}`);
            onLine(`    Kong:${p.kong}  Studio:${p.studio}  PG:${p.postgres}  ${inst.status}`);
          }
          onLine(`✓ ${registry.length} instance${registry.length !== 1 ? "s" : ""}`);
          return 0;
        }

        // ── db instance <name> <sub> ───────────────────────────────────────────
        // Commands:
        //   db instance list                       — list all runtime instances
        //   db instance <name> logs [--tail <n>]   — stream container logs
        //   db instance <name> restart             — restart all containers
        //   db instance <name> stop                — stop all containers
        //   db instance <name> start               — start all containers
        //   db instance <name> status              — container health summary
        if (sub === "instance") {
          const nameOrSub = args[1];

          // db instance list
          if (!nameOrSub || nameOrSub === "list") {
            const registry = await loadRegistry();
            if (registry.length === 0) { onLine("  (no runtime instances)"); return 0; }
            for (const inst of registry) {
              const p = inst.ports;
              onLine(`  ${inst.name.padEnd(24)} ${inst.slug}`);
              onLine(`    Kong:${p.kong}  Studio:${p.studio}  PG:${p.postgres}  ${inst.status}`);
            }
            onLine(`✓ ${registry.length} instance${registry.length !== 1 ? "s" : ""}`);
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

          onLine(`✗ usage: db instance <name> logs|restart|stop|start|remove|npm|status`);
          return 2;
        }

        onLine("✗ usage: db backup|logs|snapshot|snapshots|restore|template-capture|templates|provision|blank|smoke-test|instance|instances");
        return 2;
      },

      // ── npm list [--search <domain>]
      // ── npm search <domain>
      npm: async (args, onLine) => {
        const sub    = args[0] ?? "list";
        const search = argValue(args, "--search") ?? (sub === "search" ? args[1] : undefined);

        const { npmListHosts, npmPing } = await import("../npm-api.ts");

        const reachable = await npmPing();
        if (!reachable) {
          onLine(`✗ NPM unreachable — check that L0VE is up and the agent is running`);
          return 1;
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

        onLine(`NPM Proxy Hosts on ${NPM_HOST.ip}  (${filtered.length}${search ? ` matching "${search}"` : ""} of ${hosts.length} total)`);
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
          const status = await getStatus(devContainerName(zone));
          if (status === "running" || status === "starting") {
            onLine(`✓ dev container already ${status} for ${zone.label}`);
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

      // unaxis zone <name> status
      // unaxis zone <name> logs [--tail <lines>]
      // unaxis zone <name> dev start|stop|restart
      // unaxis zone <name> dev logs [--tail <lines>]
      zone: async (args, onLine) => {
        const zoneName = args[0];
        if (!zoneName) { onLine("✗ usage: zone <zone-key> status|logs|dev <start|stop|restart|logs>"); return 2; }
        const zone = await resolveZone(zoneName);
        if (!zone) { onLine(`✗ zone not found: "${zoneName}"`); return 1; }

        const action = args[1] ?? "status";
        if (action === "status") {
          return printZoneStatus(zone, onLine);
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

        if (action !== "dev") {
          onLine(`✗ unknown zone action: ${action}`);
          onLine("  usage: zone <zone-key> status|logs|dev <start|stop|restart|logs>");
          return 2;
        }

        const verb = args[2];
        if (!verb || !["start", "stop", "restart", "logs"].includes(verb)) {
          onLine("✗ usage: zone <zone-key> dev <start|stop|restart|logs>");
          return 2;
        }

        if (verb === "logs") {
          const tail = parseTail(args.slice(3));
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
          const status = await getStatus(devContainerName(zone));
          if (status === "running" || status === "starting") {
            onLine(`✓ dev container already running for ${zone.label}`);
            return 0;
          }
          return startDevContainer(zone, onLine);
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
        if (!target || !["proxy", "db", "npm"].includes(target)) {
          onLine("✗ usage: logs proxy|db|npm [--tail <lines>]");
          return 2;
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
    });

    // ── Remote IPC bridge (port 50506) ─────────────────────────────────────
    // Authenticated tunnel: validates stored token, then pipes to local :50505.
    // Always started — does nothing until a valid pairing key is generated.
    const bridge = startRemoteIpcBridge(async () => {
      const { getCredential } = await import('../../utils/secureStorage/index.js');
      const token = await getCredential('remote_bridge_token');
      const exp   = await getCredential('remote_bridge_token_exp');
      if (!token || !exp) return null;
      return { token, exp: parseInt(exp, 10) };
    });

    return () => { server.close(); bridge.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Proxy reconciliation on startup ───────────────────────────────────────
  // Supabase is the source of truth for zones. On every TUI boot, rebuild
  // routes.json from the live zone list + actual Docker container state so
  // the proxy is always in sync — no manual routes.json edits needed.
  useEffect(() => {
    loadZones()
      .then((zones) => reconcileProxyRoutes(zones, (name) => getStatus(name)))
      .catch(() => { /* Supabase or proxy unreachable at boot — leave routes as-is */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


}
