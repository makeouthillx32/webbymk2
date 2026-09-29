// src/ink/media-topology-store.ts
// ─────────────────────────────────────────────────────────────────────────────
// The side-effecting half of media-topology.ts: reading the topology out of the
// control DB, discovering host facts through the UNAXIS agent, diffing the
// generated config against the files on disk, applying it, and deploying an
// edge relay to any host. Pure logic lives in media-topology.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { resolve4 } from "dns/promises";
import {
  dbDeleteService,
  dbGetAllServices,
  dbGetEnvironments,
  dbGetHostFacts,
  dbGetServiceByKey,
  dbPatchHostFacts,
  dbUpsertService,
} from "./control-db.ts";
import { agentFetch, dockerFetch } from "./agent-client.ts";
import { PROJECT_DIR } from "../config/zones.ts";
import type { UnaxisEnvironment } from "./environment-store.ts";
import {
  isMediaRole,
  placementConfig,
  renderDerivedConfig,
  renderEdgeConfig,
  ROLE_DEFAULTS,
  type DerivedConfig,
  type Gateway,
  type HostFacts,
  type MediaRole,
  type Placement,
  type PortForward,
  type Topology,
} from "./media-topology.ts";

const FILES = {
  routes: join(PROJECT_DIR, "proxy-config", "routes.json"),
  coturn: join(PROJECT_DIR, "coturn", "turnserver.conf"),
  mediamtx: join(PROJECT_DIR, "mediamtx", "mediamtx.yml"),
  env: join(PROJECT_DIR, ".env"),
};

// ── Load ─────────────────────────────────────────────────────────────────────

export function loadTopology(): Topology {
  const envs = dbGetEnvironments();
  const services = dbGetAllServices();
  return {
    hosts: envs.map((e) => ({
      id: e.id,
      name: e.name,
      agentUrl: e.agentUrl,
      isDefaultTarget: e.isDefaultTarget,
      facts: dbGetHostFacts(e.id) as HostFacts,
    })),
    placements: services
      .filter((s) => s.enabled && isMediaRole(s.serviceType) && s.environmentId)
      .map((s) => ({ key: s.key, role: s.serviceType as MediaRole, envId: s.environmentId!, config: s.config ?? {} })),
    gateways: services
      .filter((s) => s.enabled && s.serviceType === "gateway")
      .map((s) => ({ key: s.key, publicIp: String(s.config?.publicIp ?? ""), forwards: (s.config?.forwards ?? []) as PortForward[] })),
  };
}

export function findEnv(name: string): UnaxisEnvironment | null {
  return dbGetEnvironments().find((e) => e.name.toLowerCase() === name.toLowerCase()) ?? null;
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function placeRole(role: MediaRole, env: UnaxisEnvironment, config: Record<string, any> = {}, key?: string): string {
  const k = key ?? `${role}@${env.name.toLowerCase()}`;
  const existing = dbGetServiceByKey(k);
  const merged = { ...(existing?.config ?? {}), ...config };
  dbUpsertService({
    key: k,
    name: `${role} on ${env.name}`,
    description: "Media topology role — managed by `unaxis media`.",
    environmentId: env.id,
    serviceType: role,
    container: placementConfig({ key: k, role, envId: env.id, config: merged }).container ?? "",
    config: merged,
    status: existing?.status ?? "unknown",
    enabled: true,
    sortOrder: 50,
  });
  return k;
}

export function unplaceRole(key: string): boolean {
  const s = dbGetServiceByKey(key);
  if (!s || !isMediaRole(s.serviceType)) return false;
  dbDeleteService(key);
  return true;
}

export function setGateway(key: string, publicIp: string, forwards?: PortForward[]): void {
  const existing = dbGetServiceByKey(key);
  dbUpsertService({
    key,
    name: `Gateway ${key}`,
    description: "Home router in front of UNAXIS hosts — its public IP and the port-forwards it actually has.",
    serviceType: "gateway",
    config: { publicIp, forwards: forwards ?? (existing?.config?.forwards ?? []) },
    status: "unknown",
    enabled: true,
    sortOrder: 40,
  });
}

// ── Fact discovery ───────────────────────────────────────────────────────────

const isPrivate = (ip: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const isTailnet = (ip: string) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);

/** Fills in what a host can tell about itself through its agent and its URL. */
export async function discoverHostFacts(env: UnaxisEnvironment, onLine: (l: string) => void): Promise<HostFacts> {
  const patch: HostFacts = { observedAt: new Date().toISOString() };
  try {
    const host = new URL(env.agentUrl).hostname;
    if (isTailnet(host)) patch.tailnetIp = host;
    else if (isPrivate(host)) patch.lanIp = host;
    else if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && host !== "127.0.0.1") patch.publicIp = host;
  } catch {
    // no agent URL
  }
  if (env.agentUrl) {
    try {
      const res = await agentFetch(env, "/health", { signal: AbortSignal.timeout(8_000) });
      const h: any = await res.json();
      if (h?.host?.cpus) patch.cpus = Number(h.host.cpus);
      if (h?.host?.loadAvg1m != null) patch.load1m = Number(h.host.loadAvg1m);
      if (h?.host?.memTotalMb) patch.memTotalMb = Number(h.host.memTotalMb);
    } catch (error) {
      onLine(`  ⚠ ${env.name}: agent /health unreachable (${error instanceof Error ? error.message : error})`);
    }
  }
  // A DDNS name is the cheapest honest source of a home connection's public IP.
  if (env.ddnsHostname) {
    try {
      const [ip] = await resolve4(env.ddnsHostname);
      if (ip) patch.publicIp = ip;
    } catch {
      // unresolvable DDNS name: leave it to a manual --public-ip
    }
  }
  return dbPatchHostFacts(env.id, patch) as HostFacts;
}

// ── Drift: generated config vs the files on disk ─────────────────────────────

export type DriftItem = { target: "routes" | "coturn" | "mediamtx" | "env"; field: string; current: string | null; derived: string | null };

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

export function currentConfig(): Record<string, string | null> {
  let routes: any = {};
  try { routes = JSON.parse(readText(FILES.routes) || "{}"); } catch { routes = {}; }
  const turn = readText(FILES.coturn).match(/^external-ip=(.+)$/m)?.[1]?.trim() ?? null;
  const hosts = readText(FILES.mediamtx).match(/^webrtcAdditionalHosts:\s*(\[.*\])\s*$/m)?.[1] ?? null;
  const envText = readText(FILES.env);
  const envVal = (k: string) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() ?? null;
  return {
    mediaHlsUpstream: routes.mediaHlsUpstream ?? "http://unt_mediamtx:8888",
    mediaWhepUpstream: routes.mediaWhepUpstream ?? "http://unt_mediamtx:8889",
    turnExternalIp: turn,
    webrtcAdditionalHosts: hosts ? JSON.stringify(parseYamlFlowList(hosts)) : null,
    SRT_MANAGER_INTERNAL_URL: envVal("SRT_MANAGER_INTERNAL_URL"),
    TANK_RECEIVER_MANAGER_URL: envVal("TANK_RECEIVER_MANAGER_URL"),
  };
}

function parseYamlFlowList(v: string): string[] {
  return v.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

export function computeDrift(d: DerivedConfig): DriftItem[] {
  const cur = currentConfig();
  const items: DriftItem[] = [
    { target: "routes", field: "mediaHlsUpstream", current: cur.mediaHlsUpstream, derived: d.mediaHlsUpstream },
    { target: "routes", field: "mediaWhepUpstream", current: cur.mediaWhepUpstream, derived: d.mediaWhepUpstream },
    { target: "coturn", field: "external-ip", current: cur.turnExternalIp, derived: d.turnExternalIp },
    {
      target: "mediamtx", field: "webrtcAdditionalHosts", current: cur.webrtcAdditionalHosts,
      derived: d.webrtcAdditionalHosts ? JSON.stringify(d.webrtcAdditionalHosts) : null,
    },
    { target: "env", field: "SRT_MANAGER_INTERNAL_URL", current: cur.SRT_MANAGER_INTERNAL_URL, derived: d.receiverManagerUrl },
    { target: "env", field: "TANK_RECEIVER_MANAGER_URL", current: cur.TANK_RECEIVER_MANAGER_URL, derived: d.receiverManagerUrl },
  ];
  return items;
}

// ── Apply ────────────────────────────────────────────────────────────────────

export type ApplyTarget = "routes" | "coturn" | "mediamtx" | "env";

/**
 * Writes the derived values into the files that differ. Returns what changed
 * and what each change needs before it takes effect. Only the proxy
 * hot-reloads; the rest are reported, not restarted, because restarting
 * MediaMTX or redeploying Tank interrupts live video.
 */
export function applyDerived(d: DerivedConfig, targets: ApplyTarget[], onLine: (l: string) => void): { changed: DriftItem[]; followUp: string[] } {
  const drift = computeDrift(d).filter((x) => targets.includes(x.target) && x.derived != null && x.current !== x.derived);
  const followUp: string[] = [];

  if (drift.some((x) => x.target === "routes")) {
    const routes = JSON.parse(readText(FILES.routes) || "{}");
    if (d.mediaHlsUpstream) routes.mediaHlsUpstream = d.mediaHlsUpstream;
    if (d.mediaWhepUpstream) routes.mediaWhepUpstream = d.mediaWhepUpstream;
    writeFileSync(FILES.routes, JSON.stringify(routes, null, 2) + "\n", "utf-8");
    onLine("  ✓ proxy-config/routes.json — the proxy hot-reloads it");
  }
  if (drift.some((x) => x.target === "coturn") && d.turnExternalIp) {
    const text = readText(FILES.coturn).replace(/^external-ip=.*$/m, `external-ip=${d.turnExternalIp}`);
    writeFileSync(FILES.coturn, text, "utf-8");
    onLine("  ✓ coturn/turnserver.conf");
    followUp.push("restart the TURN container to load the new external-ip (drops active TURN relays for a moment)");
  }
  if (drift.some((x) => x.target === "mediamtx") && d.webrtcAdditionalHosts) {
    const list = `[${d.webrtcAdditionalHosts.join(", ")}]`;
    const text = readText(FILES.mediamtx).replace(/^webrtcAdditionalHosts:.*$/m, `webrtcAdditionalHosts: ${list}`);
    writeFileSync(FILES.mediamtx, text, "utf-8");
    onLine("  ✓ mediamtx/mediamtx.yml");
    followUp.push("restart the origin MediaMTX to load the new WebRTC hosts (interrupts every camera for a few seconds)");
  }
  if (drift.some((x) => x.target === "env") && d.receiverManagerUrl) {
    let text = readText(FILES.env);
    for (const k of ["SRT_MANAGER_INTERNAL_URL", "TANK_RECEIVER_MANAGER_URL"]) {
      text = text.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${d.receiverManagerUrl}`);
    }
    writeFileSync(FILES.env, text, "utf-8");
    onLine("  ✓ .env (receiver manager URL)");
    followUp.push("redeploy the zones that read the receiver manager URL from .env (e.g. `unaxis <project> zone <key> build --bg`)");
  }
  return { changed: drift, followUp };
}

// ── Edge deploy ──────────────────────────────────────────────────────────────

function tarOne(name: string, data: Buffer): Buffer {
  const h = Buffer.alloc(512);
  h.write(name, 0, "utf8");
  h.write("0000644\0", 100); h.write("0000000\0", 108); h.write("0000000\0", 116);
  h.write(data.length.toString(8).padStart(11, "0") + "\0", 124);
  h.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136);
  h.write("        ", 148); h.write("0", 156); h.write("ustar\0", 257); h.write("00", 263);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  return Buffer.concat([h, data, Buffer.alloc((512 - (data.length % 512)) % 512), Buffer.alloc(1024)]);
}

/**
 * (Re)creates the edge relay container for a media-edge placement on its host:
 * pinned image, generated config uploaded before first start, restart policy.
 * Replacing a running edge drops that edge's viewers for a few seconds.
 */
export async function deployEdge(key: string, onLine: (l: string) => void): Promise<number> {
  const t = loadTopology();
  const p = t.placements.find((x) => x.key === key && x.role === "media-edge");
  if (!p) { onLine(`✗ no media-edge placement "${key}"`); return 1; }
  const env = dbGetEnvironments().find((e) => e.id === p.envId);
  if (!env?.agentUrl) { onLine(`✗ ${env?.name ?? key} has no UNAXIS agent`); return 1; }
  const c = placementConfig(p);
  let yml: string;
  try {
    yml = renderEdgeConfig(t, key);
  } catch (error) {
    onLine(`✗ ${error instanceof Error ? error.message : error}`);
    return 1;
  }

  onLine(`• pulling ${c.image} on ${env.name}…`);
  const [repo, tag] = String(c.image).split(":");
  const pull = await dockerFetch(env, `/images/create?fromImage=${repo}&tag=${tag ?? "latest"}`, {
    method: "POST", signal: AbortSignal.timeout(300_000),
  });
  const pullText = await pull.text();
  if (!pull.ok || /"error"/.test(pullText)) { onLine(`✗ image pull failed: ${pullText.slice(-200)}`); return 1; }

  const name = String(c.container);
  const existing = await dockerFetch(env, `/containers/${name}/json`);
  if (existing.ok) {
    onLine(`• replacing existing ${name}`);
    await dockerFetch(env, `/containers/${name}?force=true`, { method: "DELETE" });
  }

  const ports: Array<[number, "tcp" | "udp"]> = [[c.hlsPort, "tcp"], [c.whepPort, "tcp"], [c.iceUdpPort, "udp"], [c.iceUdpPort, "tcp"], [c.apiPort, "tcp"]];
  const ExposedPorts: Record<string, object> = {};
  const PortBindings: Record<string, Array<{ HostIp: string; HostPort: string }>> = {};
  for (const [port, proto] of ports) {
    ExposedPorts[`${port}/${proto}`] = {};
    PortBindings[`${port}/${proto}`] = [{ HostIp: "0.0.0.0", HostPort: String(port) }];
  }
  const create = await dockerFetch(env, `/containers/create?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Image: c.image,
      Labels: { "unaxis.managed": "true", "unaxis.role": "media-edge", "unaxis.placement": key },
      ExposedPorts,
      HostConfig: {
        PortBindings,
        RestartPolicy: { Name: "unless-stopped" },
        LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "3" } },
      },
    }),
  });
  if (!create.ok) { onLine(`✗ create failed: ${(await create.text()).slice(0, 300)}`); return 1; }
  const { Id } = (await create.json()) as { Id: string };

  const put = await dockerFetch(env, `/containers/${Id}/archive?path=/`, {
    method: "PUT", headers: { "Content-Type": "application/x-tar" }, body: tarOne("mediamtx.yml", Buffer.from(yml)),
  });
  if (!put.ok) { onLine(`✗ config upload failed (${put.status})`); return 1; }
  const start = await dockerFetch(env, `/containers/${Id}/start`, { method: "POST" });
  if (!start.ok && start.status !== 304) { onLine(`✗ start failed (${start.status})`); return 1; }
  onLine(`✓ ${name} running on ${env.name} (${c.image}); HLS :${c.hlsPort}, WHEP :${c.whepPort}, API :${c.apiPort} (control plane only)`);
  return 0;
}

// ── Seed ─────────────────────────────────────────────────────────────────────

/**
 * One-time: records the media layout that is live today, so the generated
 * config starts out identical to the hand-written files (zero drift) and every
 * later change goes through placements instead of edits. Discovered, not
 * assumed: roles land wherever their containers actually run.
 */
export async function seedFromLive(onLine: (l: string) => void): Promise<void> {
  const envs = dbGetEnvironments();
  const where: Partial<Record<MediaRole, UnaxisEnvironment>> = {};
  const byContainer: Array<[MediaRole, string]> = [
    ["media-origin", ROLE_DEFAULTS["media-origin"].container],
    ["media-edge", ROLE_DEFAULTS["media-edge"].container],
    ["turn", ROLE_DEFAULTS.turn.container],
    ["ingress", ROLE_DEFAULTS.ingress.container],
    ["camera-receiver", ROLE_DEFAULTS["camera-receiver"].container],
  ];
  for (const env of envs) {
    if (!env.agentUrl) continue;
    let names: string[] = [];
    try {
      const res = await dockerFetch(env, "/containers/json", { signal: AbortSignal.timeout(10_000) });
      names = ((await res.json()) as Array<{ Names: string[] }>).flatMap((c) => c.Names.map((n) => n.replace(/^\//, "")));
    } catch {
      onLine(`  ⚠ ${env.name}: couldn't list containers`);
      continue;
    }
    for (const [role, container] of byContainer) {
      if (names.includes(container) && !where[role]) where[role] = env;
    }
  }
  for (const [role, env] of Object.entries(where) as Array<[MediaRole, UnaxisEnvironment]>) {
    const config = role === "media-edge" ? { primary: true } : {};
    const key = placeRole(role, env, config);
    onLine(`  ✓ ${key}`);
  }
}

export type { Gateway, Placement };
