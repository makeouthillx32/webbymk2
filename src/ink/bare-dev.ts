// src/ink/bare-dev.ts
// -----------------------------------------------------------------------------
// Bare-metal dev mode: an alternative to dev-container.ts's Docker-based dev
// loop, for zones where the container path isn't fast enough to be usable.
//
// Added 2026-08-30 for the tank zone: the containerized dev loop repeatedly
// took 40s+ to compile a single route under real Docker-VM resource
// contention (~25 containers running concurrently on this host), even after
// removing an unrelated CPU cap that was also throttling `next dev`. A plain
// host process reading NTFS directly (no Docker/WSL2 virtualization
// boundary) cut that to ~2s warm. See zones/tank/dev-bare.ps1 for the actual
// launch script and the two env-var overrides bare metal needs (Docker-only
// hostnames like kong/host.docker.internal don't resolve from the host).
//
// Deliberately NOT a database/schema change. BARE_METAL_DEV_ZONES below is a
// small, explicit, in-code allowlist — the same "opt-in, default unaffected"
// shape as Zone.hosting ("docker" | "vercel" in config/zones.ts), just
// without touching the SQLite-backed zone registry at all. Every zone not
// listed here keeps using dev-container.ts exactly as before; this file
// changes nothing about their behavior.
//
// Reuses the SAME proxy-route and NPM-host machinery dev-container.ts uses
// (addZoneRoute/removeZoneRoute, npmAddDevHost/deleteZoneNpmHost, and its
// devDomain/devRouteKey naming helpers) — only the process lifecycle and the
// proxy upstream target differ (host:port instead of a container hostname).
//
// Liveness is checked by PORT, not by a stored PID. First attempt tracked
// the spawned process's own pid and used process.kill(pid, 0) to check it —
// wrong on two counts, both confirmed live 2026-08-30: (1) `detached: true`
// on Windows puts the child in the SAME job object as this process (Bun/
// Node create one with KILL_ON_JOB_CLOSE), so the "detached" powershell.exe
// was found dead seconds later with a 0-byte log — fixed by launching
// through `cmd /c start /B` instead, the actual Windows idiom for a process
// that survives its parent; (2) even with a real survivor, its own pid is
// useless afterward because `next dev` reparents through worker processes,
// so the original pid may not be the one actually holding the port. Asking
// "who's listening on the port" is the one question that's always the
// right one to ask, on any spawn strategy.
// -----------------------------------------------------------------------------

import { spawn, execFile } from "child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, openSync, statSync, readSync, closeSync } from "fs";
import { join } from "path";
import os from "os";

import type { Zone } from "../config/zones.ts";
import { PROJECT_DIR } from "../config/zones.ts";
import { STACK_HOST } from "../config/stack.ts";
import { addZoneRoute, removeZoneRoute } from "./proxy-config.ts";
import { npmAddDevHost } from "./npm-api.ts";
import { deleteZoneNpmHost } from "./zone/npm-cleanup.ts";
import { devDomain, devRouteKey } from "./dev-container.ts";

export type BareDevConfig = {
  /** Port the bare-metal `next dev` process listens on. */
  port: number;
  /** PowerShell launch script, relative to PROJECT_DIR. */
  script: string;
  /** Host reachable from the proxy container — POWER's LAN IP today. */
  host: string;
};

// Add an entry here to give another zone the bare-metal dev path. Every
// zone NOT listed here is completely unaffected — dev-container.ts's
// Docker path is still the only thing that ever runs for them.
const BARE_METAL_DEV_ZONES: Record<string, BareDevConfig> = {
  tank: { port: 3012, script: "zones/tank/dev-bare.ps1", host: "192.168.50.204" },
};

/** Null when this zone doesn't opt into bare-metal dev mode. */
export function bareDevConfig(zone: Zone): BareDevConfig | null {
  return BARE_METAL_DEV_ZONES[zone.key] ?? null;
}

function stateDir(): string {
  const dir = join(os.homedir(), "AppData", "Roaming", "unaxis", "bare-dev");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function logFile(zone: Zone): string {
  return join(stateDir(), `${zone.key}.log`);
}

/** PID currently LISTENING on `port` (Windows `netstat -ano`), or null. */
function findPidOnPort(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    execFile("netstat", ["-ano"], (err, stdout) => {
      if (err || !stdout) { resolve(null); return; }
      for (const line of stdout.split("\n")) {
        // "  TCP    0.0.0.0:3012      0.0.0.0:0      LISTENING       12345"
        const m = line.match(/^\s*TCP\s+\S*:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (m && Number(m[1]) === port) {
          resolve(Number(m[2]));
          return;
        }
      }
      resolve(null);
    });
  });
}

/** True if some process is currently listening on this zone's bare-dev port. */
export async function isBareDevRunning(zone: Zone): Promise<boolean> {
  const cfg = bareDevConfig(zone);
  if (!cfg) return false;
  return (await findPidOnPort(cfg.port)) !== null;
}

export async function startBareDev(
  zone:   Zone,
  onLine: (l: string) => void,
): Promise<number> {
  const cfg = bareDevConfig(zone);
  if (!cfg) {
    onLine(`✗ no bare-metal dev config for zone "${zone.key}"`);
    return 1;
  }

  const scriptPath = join(PROJECT_DIR, cfg.script);
  if (!existsSync(scriptPath)) {
    onLine(`✗ launch script not found: ${scriptPath}`);
    return 1;
  }

  onLine(`Starting bare-metal dev server for ${zone.label}…`);
  onLine(`  script : ${cfg.script}`);
  onLine(`  port   : ${cfg.port}  (also reachable directly at http://localhost:${cfg.port})`);

  // Own log file, not a pipe — the child must survive the TUI process
  // exiting, and a pipe with nothing reading it would eventually block the
  // child on a full OS buffer. `cmd /c start /B` (not spawn's own
  // `detached: true`) is what actually gets the child out of this
  // process's job object on Windows — see the file header for why.
  const out = openSync(logFile(zone), "a");
  const proc = spawn(
    "cmd.exe",
    [
      "/d", "/c", "start", "", "/B",
      "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
    ],
    { cwd: PROJECT_DIR, windowsHide: true, stdio: ["ignore", out, out] },
  );
  proc.unref();

  const routeKey = devRouteKey(zone);
  const upstream = `http://${cfg.host}:${cfg.port}`;
  onLine(`✓ Launch requested — registering proxy route…`);
  await addZoneRoute(routeKey, upstream, onLine);

  onLine(`Registering NPM proxy host…`);
  await npmAddDevHost(devDomain(zone), STACK_HOST.ip, STACK_HOST.proxyPort, onLine);

  onLine(`✓ Bare-metal dev server starting — first compile still takes ~10-30s, same as any next dev cold start.`);
  onLine(`  Logs: unaxis zone ${zone.key} dev logs`);
  return 0;
}

export async function stopBareDev(
  zone:   Zone,
  onLine: (l: string) => void,
): Promise<number> {
  const cfg = bareDevConfig(zone);
  if (!cfg) {
    onLine(`✗ no bare-metal dev config for zone "${zone.key}"`);
    return 1;
  }

  onLine(`Stopping bare-metal dev server for ${zone.label}…`);

  const routeKey = devRouteKey(zone);
  await removeZoneRoute(routeKey, onLine);
  await deleteZoneNpmHost(routeKey, onLine);

  const pid = await findPidOnPort(cfg.port);
  if (pid) {
    // /T kills the whole process tree — `next dev` forks a worker, and
    // plain taskkill on just the listener's own pid can leave that worker
    // running (or vice versa, depending which pid netstat reports).
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
      killer.on("close", () => resolve());
      killer.on("error", () => resolve());
    });
    onLine(`  Killed process ${pid} (port ${cfg.port})`);
  } else {
    onLine(`  Nothing was listening on port ${cfg.port}`);
  }

  const file = logFile(zone);
  if (existsSync(file)) {
    try { unlinkSync(file); } catch { /* fine, next start reopens it */ }
  }

  onLine(`✓ Bare-metal dev server stopped (${zone.key})`);
  return 0;
}

/**
 * Live-tail the bare-metal process's log file (poll-based — the file is a
 * plain fs.openSync(..., "a") target written by cmd.exe's redirected stdout/
 * stderr, not a pipe, so there's no stream to subscribe to directly). Mirrors
 * `docker logs -f`'s role in runDevModeOp for the Docker dev-container path,
 * so the same background-stack UI (fullscreen/dismiss-to-stop/restart) can
 * drive a bare-metal zone the same way it already drives a Docker one.
 *
 * Returns a stop function — caller must call it when done watching (op
 * dismissed, restarted, or the TUI exits) or the interval leaks.
 */
export function streamBareDevLogs(zone: Zone, onLine: (l: string) => void): () => void {
  const file = logFile(zone);
  let offset = 0;
  let alive = true;

  // Seed from whatever's already on disk so a restart doesn't replay the
  // entire history — start tailing from current EOF, same as `tail -f`.
  if (existsSync(file)) {
    try { offset = statSync(file).size; } catch { /* file may be mid-write; poll will catch it */ }
  }

  const poll = () => {
    if (!alive) return;
    if (!existsSync(file)) return;
    let size: number;
    try { size = statSync(file).size; } catch { return; }
    if (size < offset) offset = 0; // log file rotated/truncated — restart from top
    if (size > offset) {
      try {
        const fd = openSync(file, "r");
        const buf = Buffer.alloc(size - offset);
        readSync(fd, buf, 0, buf.length, offset);
        closeSync(fd);
        offset = size;
        const chunk = buf.toString("utf8");
        for (const line of chunk.split("\n")) {
          if (line.length > 0) onLine(line);
        }
      } catch { /* transient — next poll retries */ }
    }
  };

  const interval = setInterval(poll, 500);
  poll(); // one immediate read so the overlay isn't blank for the first 500ms

  return () => {
    alive = false;
    clearInterval(interval);
  };
}

/** Last N lines of the bare-metal process's own stdout/stderr log. */
export async function tailBareDevLogs(
  zone:   Zone,
  tail:   number,
  onLine: (l: string) => void,
): Promise<number> {
  const file = logFile(zone);
  if (!existsSync(file)) {
    onLine(`  No log file yet for ${zone.key} — has it been started?`);
    return 0;
  }
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  const slice = lines.slice(-tail);
  onLine(`Logs ${zone.key}-dev-bare (tail ${slice.length})`);
  for (const line of slice) onLine(line);
  onLine(`✓ zone dev logs: ${zone.key} (${slice.length} lines)`);
  return 0;
}
