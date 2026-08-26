// src/ink/env-probe.ts
// ─────────────────────────────────────────────────────────────────────────────
// Environment state detection — the "is it online, sleeping, off, restarting,
// or wedged?" engine.
//
// Layered probes, cheapest first:
//
//   1. TCP connect to the agent host:port      → host reachability
//   2. GET  <agent>/health   (signed, 4s)      → agent alive + latency
//   3. GET  <agent>/docker/_ping (signed, 4s)  → Docker engine alive + latency
//   4. local-docker fallback: `docker version` via CLI when the agent itself
//      is down (the agent runs IN docker, so agent-down usually just means
//      the engine is off — the CLI probe disambiguates).
//
// Classification:
//
//   online      agent ok + engine ok, fast
//   busy        agent/engine ok but slow (latency over threshold)
//   wedged      agent ok but engine ping TIMES OUT (hung containerd — the
//               "zombie buildkit" failure mode)
//   engine-off  agent (or CLI) says the Docker engine is stopped/paused —
//               host awake, Docker sleeping (e.g. paused for gaming)
//   restarting  currently failing but was online < RESTART_WINDOW ago
//   agent-down  host reachable but agent not responding (and engine state
//               unknown — remote host without CLI fallback)
//   offline     host itself unreachable (machine off or asleep)
//   unknown     no agent configured / never probed
// ─────────────────────────────────────────────────────────────────────────────

import net from "node:net";
import { agentFetch }             from "./agent-client.ts";
import type { UnaxisEnvironment } from "./environment-store.ts";

export type EnvProbeState =
  | "online"
  | "busy"
  | "wedged"
  | "engine-off"
  | "restarting"
  | "agent-down"
  | "offline"
  | "unknown";

export interface EnvProbeResult {
  state:          EnvProbeState;
  /** Human one-liner explaining the classification. */
  detail:         string;
  /** Individual endpoint verdicts — the "tiles". */
  host:           "up" | "down" | "unknown";
  agent:          "up" | "down" | "unknown";
  engine:         "up" | "off" | "wedged" | "unknown";
  agentLatencyMs:  number | null;
  engineLatencyMs: number | null;
  probedAt:       string;   // ISO
}

// Tunables
const TCP_TIMEOUT_MS     = 2_500;
const HTTP_TIMEOUT_MS    = 4_000;
const BUSY_THRESHOLD_MS  = 1_500;
const RESTART_WINDOW_MS  = 3 * 60_000;
const LOCAL_CLI_TIMEOUT  = 3_500;

// ── In-memory history (per TUI process) ──────────────────────────────────────
// Used for restart detection and flap smoothing. agentLastSeenAt from the DB
// seeds "last online" across TUI restarts.

const lastOnlineAt = new Map<string, number>();

export function noteOnline(envId: string): void {
  lastOnlineAt.set(envId, Date.now());
}

function wasRecentlyOnline(env: UnaxisEnvironment): boolean {
  const mem = lastOnlineAt.get(env.id);
  if (mem && Date.now() - mem < RESTART_WINDOW_MS) return true;
  if (env.agentLastSeenAt) {
    const db = Date.parse(env.agentLastSeenAt);
    if (!Number.isNaN(db) && Date.now() - db < RESTART_WINDOW_MS) return true;
  }
  return false;
}

// ── Probe primitives ──────────────────────────────────────────────────────────

type TcpVerdict = "open" | "refused" | "unreachable";

function probeTcp(host: string, port: number): Promise<TcpVerdict> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const done = (v: TcpVerdict) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(TCP_TIMEOUT_MS);
    sock.once("connect", () => done("open"));
    sock.once("timeout", () => done("unreachable"));
    sock.once("error", (err: NodeJS.ErrnoException) => {
      // ECONNREFUSED = host awake, port closed. Anything else = unreachable.
      done(err.code === "ECONNREFUSED" ? "refused" : "unreachable");
    });
    sock.connect(port, host);
  });
}

type HttpVerdict = { ok: boolean; timedOut: boolean; latencyMs: number | null };

/** Engine state self-reported by agent >= 1.1.0 in GET /health. */
interface AgentEngineReport {
  state:     "up" | "wedged" | "off" | "error";
  latencyMs: number | null;
  error:     string | null;
}

type HealthVerdict = HttpVerdict & { engine: AgentEngineReport | null };

async function probeAgentPath(
  env:  UnaxisEnvironment,
  path: string,
): Promise<HttpVerdict> {
  const started = Date.now();
  try {
    const res = await agentFetch(env, path, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    return { ok: res.ok, timedOut: false, latencyMs: Date.now() - started };
  } catch (err) {
    const timedOut =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, timedOut, latencyMs: null };
  }
}

/**
 * /health probe that also parses the body. Agents >= 1.1.0 self-report
 * Docker engine state (authoritative — the agent sits on the host).
 * Older agents return the legacy shape → engine: null → caller falls back
 * to the external /docker/_ping probe.
 */
async function probeAgentHealth(env: UnaxisEnvironment): Promise<HealthVerdict> {
  const started = Date.now();
  try {
    const res = await agentFetch(env, "/health", {
      // Agent-side engine probe is bounded at 3s — allow for it on top of HTTP.
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS + 3_500),
    });
    if (!res.ok) return { ok: false, timedOut: false, latencyMs: Date.now() - started, engine: null };
    const json = (await res.json()) as { engine?: AgentEngineReport } | null;
    return {
      ok: true, timedOut: false, latencyMs: Date.now() - started,
      engine: json?.engine && typeof json.engine.state === "string" ? json.engine : null,
    };
  } catch (err) {
    const timedOut =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, timedOut, latencyMs: null, engine: null };
  }
}

/** Local engine check via docker CLI — only for local-docker environments. */
async function probeLocalEngine(): Promise<"up" | "off" | "wedged"> {
  try {
    const proc = Bun.spawn(["docker", "version", "--format", "{{.Server.Version}}"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => proc.kill(), LOCAL_CLI_TIMEOUT);
    const code  = await proc.exited;
    clearTimeout(timer);
    if (code === 0) return "up";
    // Non-zero exit that returned promptly = daemon not running (off/paused).
    return "off";
  } catch {
    return "off";
  }
}

// ── Main probe ────────────────────────────────────────────────────────────────

export async function probeEnvironment(
  env: UnaxisEnvironment,
): Promise<EnvProbeResult> {
  const probedAt = new Date().toISOString();

  if (!env.agentUrl) {
    return {
      state: "unknown", detail: "no agent configured",
      host: "unknown", agent: "unknown", engine: "unknown",
      agentLatencyMs: null, engineLatencyMs: null, probedAt,
    };
  }

  let host: string, port: number;
  try {
    const u = new URL(env.agentUrl);
    host = u.hostname;
    port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
  } catch {
    return {
      state: "unknown", detail: `bad agent url: ${env.agentUrl}`,
      host: "unknown", agent: "unknown", engine: "unknown",
      agentLatencyMs: null, engineLatencyMs: null, probedAt,
    };
  }

  // Layer 1 — host reachability
  const tcp = await probeTcp(host, port);

  if (tcp === "unreachable") {
    const restarting = wasRecentlyOnline(env);
    return {
      state:  restarting ? "restarting" : "offline",
      detail: restarting
        ? "host stopped answering moments ago — likely restarting"
        : "host unreachable — machine off or asleep",
      host: "down", agent: "down", engine: "unknown",
      agentLatencyMs: null, engineLatencyMs: null, probedAt,
    };
  }

  if (tcp === "refused") {
    // Host awake, agent port closed. The agent runs in Docker, so this
    // usually means the engine (and the agent with it) is stopped.
    const isLocal = env.type === "local-docker";
    const engine  = isLocal ? await probeLocalEngine() : "unknown";
    const restarting = wasRecentlyOnline(env);

    if (engine === "up") {
      return {
        state:  "agent-down",
        detail: "Docker engine is up but the agent container is not running",
        host: "up", agent: "down", engine: "up",
        agentLatencyMs: null, engineLatencyMs: null, probedAt,
      };
    }
    return {
      state:  restarting ? "restarting" : engine === "unknown" ? "agent-down" : "engine-off",
      detail: restarting
        ? "agent just went dark — likely engine restarting"
        : engine === "unknown"
          ? "host up, agent down — Docker likely off (no local CLI to confirm)"
          : "host awake, Docker engine off — sleeping",
      host: "up", agent: "down", engine,
      agentLatencyMs: null, engineLatencyMs: null, probedAt,
    };
  }

  // Layer 2 — agent /health (agents >= 1.1.0 self-report engine state)
  const health = await probeAgentHealth(env);

  if (!health.ok) {
    const restarting = wasRecentlyOnline(env);
    return {
      state:  restarting ? "restarting" : "agent-down",
      detail: health.timedOut
        ? "agent port open but /health timed out — agent starting or overloaded"
        : "agent port open but /health failed",
      host: "up", agent: "down", engine: "unknown",
      agentLatencyMs: health.latencyMs, engineLatencyMs: null, probedAt,
    };
  }

  // Layer 3a — authoritative: agent self-reported engine state
  if (health.engine) {
    const rep = health.engine;
    if (rep.state === "up") {
      noteOnline(env.id);
      const slow =
        (health.latencyMs ?? 0) > BUSY_THRESHOLD_MS ||
        (rep.latencyMs ?? 0) > BUSY_THRESHOLD_MS;
      return {
        state:  slow ? "busy" : "online",
        detail: slow ? "responding slowly — under load" : "agent + engine healthy (agent-reported)",
        host: "up", agent: "up", engine: "up",
        agentLatencyMs: health.latencyMs, engineLatencyMs: rep.latencyMs, probedAt,
      };
    }
    if (rep.state === "wedged") {
      return {
        state:  "wedged",
        detail: rep.error ?? "engine hung (agent-reported)",
        host: "up", agent: "up", engine: "wedged",
        agentLatencyMs: health.latencyMs, engineLatencyMs: null, probedAt,
      };
    }
    // "off" | "error" → engine not serving
    return {
      state:  "engine-off",
      detail: rep.error ?? "Docker stopped or paused (agent-reported)",
      host: "up", agent: "up", engine: "off",
      agentLatencyMs: health.latencyMs, engineLatencyMs: rep.latencyMs, probedAt,
    };
  }

  // Layer 3b — fallback for pre-1.1.0 agents: external engine ping
  const engine = await probeAgentPath(env, "/docker/_ping");

  if (engine.ok) {
    noteOnline(env.id);
    const slow =
      (health.latencyMs ?? 0) > BUSY_THRESHOLD_MS ||
      (engine.latencyMs ?? 0) > BUSY_THRESHOLD_MS;
    return {
      state:  slow ? "busy" : "online",
      detail: slow ? "responding slowly — under load" : "agent + engine healthy",
      host: "up", agent: "up", engine: "up",
      agentLatencyMs: health.latencyMs, engineLatencyMs: engine.latencyMs, probedAt,
    };
  }

  if (engine.timedOut) {
    return {
      state:  "wedged",
      detail: "agent healthy but engine ping timed out — Docker hung (needs restart)",
      host: "up", agent: "up", engine: "wedged",
      agentLatencyMs: health.latencyMs, engineLatencyMs: null, probedAt,
    };
  }

  return {
    state:  "engine-off",
    detail: "agent up but engine refused — Docker stopped or paused",
    host: "up", agent: "up", engine: "off",
    agentLatencyMs: health.latencyMs, engineLatencyMs: engine.latencyMs, probedAt,
  };
}

/** Probe several environments in parallel. */
export async function probeEnvironments(
  envs: UnaxisEnvironment[],
): Promise<Map<string, EnvProbeResult>> {
  const results = await Promise.all(envs.map((e) => probeEnvironment(e)));
  const map = new Map<string, EnvProbeResult>();
  envs.forEach((e, i) => map.set(e.id, results[i]!));
  return map;
}

// ── Presentation helpers (shared by CLI + panel tiles) ────────────────────────

export function probeStateTile(state: EnvProbeState): {
  icon: string; color: string; label: string;
} {
  switch (state) {
    case "online":     return { icon: "●", color: "green",   label: "online" };
    case "busy":       return { icon: "◐", color: "yellow",  label: "busy" };
    case "wedged":     return { icon: "▲", color: "red",     label: "wedged" };
    case "engine-off": return { icon: "⏾", color: "blue",    label: "sleeping" };
    case "restarting": return { icon: "↻", color: "yellow",  label: "restarting" };
    case "agent-down": return { icon: "◌", color: "magenta", label: "agent down" };
    case "offline":    return { icon: "○", color: "gray",    label: "offline" };
    case "unknown":    return { icon: "?", color: "gray",    label: "unknown" };
  }
}
