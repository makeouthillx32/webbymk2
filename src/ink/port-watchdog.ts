// src/ink/port-watchdog.ts
// ─────────────────────────────────────────────────────────────────────────────
// Watches the path the internet actually takes into POWER — the host-published
// ports Nginx Proxy Manager forwards to — and repairs it when it breaks.
//
// Why this exists (2026-10-10/12 outage): after a network drop, Docker
// Desktop's host→VM port forwarder went dead for some containers. Docker kept
// reporting every container running/healthy, the proxy answered inside its
// own container, and the status collector stayed "operational" — but every
// connection to <lan-ip>:3080 was accepted by com.docker.backend and dropped
// a few ms later with zero bytes. www/tank/db.unenter.live all 502'd for days.
//
// Signature (protocol-agnostic, so it works for HTTP, SSH, RTMP, Postgres…):
//   connect, send NOTHING, wait PROBE_HOLD_MS.
//   healthy  → the server holds the connection open (or sends a banner).
//   dead     → peer closes with 0 bytes almost immediately, or refuses.
//
// Repair: `docker restart <container>` rebinds its published ports. Limited by
// a per-container cooldown and an hourly cap; when restarts stop helping the
// watchdog reports that Docker Desktop itself needs a restart and does NOT do
// it — that action always needs the user's go-ahead.
// ─────────────────────────────────────────────────────────────────────────────

import net from "net";
import { spawn } from "child_process";
import { hostname } from "os";
import { readFileSync, writeFileSync } from "fs";
import { DOCKER_ENV } from "./utils/dockerEnv.ts";

// ── Tunables ──────────────────────────────────────────────────────────────────

export const WATCHDOG_INTERVAL_MS = 30_000;
const PROBE_HOLD_MS        = 1_500;
/** Consecutive dead rounds before acting — rides out a container mid-restart. */
export const FAILS_BEFORE_REPAIR = 2;
/** Ignore containers started this recently; their ports may not be bound yet. */
export const STARTUP_GRACE_MS    = 60_000;
export const REPAIR_COOLDOWN_MS  = 5 * 60_000;
export const MAX_REPAIRS_PER_HOUR = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PublishedContainer {
  name:      string;
  startedAt: number;     // epoch ms
  tcpPorts:  number[];   // host ports bound on all interfaces
}

export type ProbeResult = "ok" | "dead";

export interface ContainerState {
  fails:   number;
  repairs: number[];     // epoch ms of recent restarts
  escalated: boolean;    // already told the user restarts aren't helping
}

export type WatchdogAction =
  | { kind: "restart";  container: string; deadPorts: number[] }
  | { kind: "escalate"; container: string; deadPorts: number[] }
  | { kind: "recovered"; container: string };

// ── Pure decision logic (unit-tested) ─────────────────────────────────────────

/**
 * Given this round's probe results, update per-container state and return
 * what to do. `deadPorts` is empty when every port answered.
 */
export function decide(
  state: Map<string, ContainerState>,
  round: Array<{ container: PublishedContainer; deadPorts: number[] }>,
  now: number,
): WatchdogAction[] {
  const actions: WatchdogAction[] = [];
  const seen = new Set<string>();

  for (const { container, deadPorts } of round) {
    seen.add(container.name);
    const s = state.get(container.name) ?? { fails: 0, repairs: [], escalated: false };
    s.repairs = s.repairs.filter((t) => now - t < 60 * 60_000);

    if (deadPorts.length === 0) {
      if (s.fails >= FAILS_BEFORE_REPAIR || s.escalated) actions.push({ kind: "recovered", container: container.name });
      s.fails = 0;
      s.escalated = false;
    } else if (now - container.startedAt < STARTUP_GRACE_MS) {
      // Just (re)started — give its ports time to bind before judging.
    } else {
      s.fails += 1;
      const lastRepair = s.repairs.at(-1) ?? 0;
      if (s.fails >= FAILS_BEFORE_REPAIR && now - lastRepair >= REPAIR_COOLDOWN_MS) {
        if (s.repairs.length < MAX_REPAIRS_PER_HOUR) {
          s.repairs.push(now);
          actions.push({ kind: "restart", container: container.name, deadPorts });
        } else if (!s.escalated) {
          s.escalated = true;
          actions.push({ kind: "escalate", container: container.name, deadPorts });
        }
      }
    }
    state.set(container.name, s);
  }

  for (const name of [...state.keys()]) if (!seen.has(name)) state.delete(name);
  return actions;
}

/** Parse `docker inspect` JSON into the containers worth watching. */
export function parsePublished(inspectJson: string): PublishedContainer[] {
  const out: PublishedContainer[] = [];
  for (const c of JSON.parse(inspectJson) as any[]) {
    const name = String(c.Name ?? "").replace(/^\//, "");
    if (!name.startsWith("unt_") || c.State?.Status !== "running") continue;
    const ports = new Set<number>();
    for (const [spec, binds] of Object.entries<any>(c.NetworkSettings?.Ports ?? {})) {
      if (!spec.endsWith("/tcp") || !Array.isArray(binds)) continue;
      for (const b of binds) {
        // Loopback-only bindings (e.g. the proxy admin API) never face NPM.
        if (b.HostIp === "127.0.0.1" || b.HostIp === "::1") continue;
        const p = Number(b.HostPort);
        if (p > 0) ports.add(p);
      }
    }
    if (ports.size === 0) continue;
    out.push({ name, startedAt: Date.parse(c.State.StartedAt) || 0, tcpPorts: [...ports].sort((a, b) => a - b) });
  }
  return out;
}

// ── I/O ───────────────────────────────────────────────────────────────────────

function docker(args: string[], timeoutMs = 30_000): Promise<{ out: string; code: number }> {
  return new Promise((resolve) => {
    let out = "";
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn("docker", args, { env: DOCKER_ENV, stdio: ["ignore", "pipe", "ignore"] });
    } catch { return resolve({ out: "", code: 1 }); }
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    proc.stdout!.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", (code) => { clearTimeout(timer); resolve({ out, code: code ?? 1 }); });
    proc.on("error", () => { clearTimeout(timer); resolve({ out: "", code: 1 }); });
  });
}

/**
 * Connect without sending anything; a healthy listener holds the line.
 * The connect itself must complete — a SYN that is never answered (filtered
 * port, hung forwarder) is dead, not "held open".
 */
export function probePort(host: string, port: number, holdMs = PROBE_HOLD_MS): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let settled = false;
    let connected = false;
    let bytes = 0;
    const sock = net.connect({ host, port });
    const done = (r: ProbeResult) => { if (!settled) { settled = true; sock.destroy(); resolve(r); } };
    sock.on("connect", () => { connected = true; });
    sock.on("data", (b) => { bytes += b.length; done("ok"); });   // banner = alive
    sock.on("close", () => done(bytes > 0 ? "ok" : "dead"));
    sock.on("error", () => done("dead"));
    sock.setTimeout(holdMs, () => done(connected ? "ok" : "dead"));
  });
}

async function listPublished(): Promise<PublishedContainer[] | null> {
  const ids = await docker(["ps", "-q", "--filter", "name=^unt_"]);
  if (ids.code !== 0) return null;
  const list = ids.out.split(/\s+/).filter(Boolean);
  if (list.length === 0) return [];
  const insp = await docker(["inspect", ...list]);
  if (insp.code !== 0) return null;
  try { return parsePublished(insp.out); } catch { return null; }
}

// ── Single owner ──────────────────────────────────────────────────────────────
// Prod (:50505) and dev (:50507) TUIs can run at once, one under WSL and one
// under Windows. Only one may restart containers, or both would act on the
// same failure. A lock file in the shared project dir, refreshed every tick,
// names the owner; a stale lock (owner gone) is taken over.

const LOCK_STALE_MS = 3 * WATCHDOG_INTERVAL_MS;

/** True when this process owns (or just took) the lock at `path`. */
export function claimLock(path: string, me: string, now: number): boolean {
  try {
    const cur = JSON.parse(readFileSync(path, "utf8")) as { owner?: string; ts?: number };
    if (cur.owner && cur.owner !== me && now - (cur.ts ?? 0) < LOCK_STALE_MS) return false;
  } catch {
    // missing or unreadable — free to take
  }
  try { writeFileSync(path, JSON.stringify({ owner: me, ts: now })); } catch { return false; }
  return true;
}

// ── Runner ────────────────────────────────────────────────────────────────────

export interface WatchdogEvents {
  onLine: (msg: string, level: "info" | "warn" | "error") => void;
}

/**
 * Start the watchdog. `host` is the core machine's LAN address — the same
 * address NPM forwards to, so the probe crosses the same Docker Desktop
 * forwarder the internet does (loopback inside WSL would take another path).
 */
export function startPortWatchdog(host: string, lockPath: string, ev: WatchdogEvents): () => void {
  const state = new Map<string, ContainerState>();
  const me = `${hostname()}:${process.pid}`;
  let running = false;
  let stopped = false;

  const tick = async () => {
    if (running || stopped) return;
    if (!claimLock(lockPath, me, Date.now())) return;
    running = true;
    try {
      const containers = await listPublished();
      if (!containers) return; // Docker engine unreachable — not a port problem.

      const round = await Promise.all(containers.map(async (c) => {
        const results = await Promise.all(c.tcpPorts.map((p) => probePort(host, p)));
        return { container: c, deadPorts: c.tcpPorts.filter((_, i) => results[i] === "dead") };
      }));

      for (const a of decide(state, round, Date.now())) {
        const ports = "deadPorts" in a ? a.deadPorts.join(",") : "";
        if (a.kind === "restart") {
          ev.onLine(`${a.container}: ports ${ports} unreachable on ${host} while the container runs — restarting it to rebind`, "warn");
          const r = await docker(["restart", a.container], 90_000);
          ev.onLine(r.code === 0 ? `${a.container}: restarted` : `${a.container}: restart failed (exit ${r.code})`, r.code === 0 ? "info" : "error");
        } else if (a.kind === "escalate") {
          ev.onLine(`${a.container}: ports ${ports} still dead after ${MAX_REPAIRS_PER_HOUR} restarts this hour — Docker Desktop's port forwarder needs a restart (not done automatically)`, "error");
        } else {
          ev.onLine(`${a.container}: published ports reachable again`, "info");
        }
      }
    } finally {
      running = false;
    }
  };

  tick();
  const id = setInterval(tick, WATCHDOG_INTERVAL_MS);
  return () => { stopped = true; clearInterval(id); };
}
