// src/ink/media-topology.ts
// ─────────────────────────────────────────────────────────────────────────────
// Media topology: which UNAXIS host does which media job, and everything that
// follows from that.
//
// Tank's media stack used to be pinned to machines by hand: the proxy's HLS
// upstream was a literal OPT1 address, coturn's external IP a literal POWER
// address, the edge relay a container someone built with scratch scripts. None
// of it survived a host being added, moved or replaced — and nothing noticed
// when a "CDN" was put on a box that shares the origin's home internet
// connection (2026-09-28: it added zero upload capacity and sat on the most
// CPU-starved machine in the house).
//
// Here a job is a ROLE placed on an ENVIRONMENT (a `services` row), hosts
// describe their network (environments.host_facts), and a home router is a
// GATEWAY with the port-forwards it actually has. From that this module:
//   • reports the topology with warnings (shared uplink, saturated hosts,
//     missing or wrong port-forwards) and a viewer-capacity estimate;
//   • renders every host-dependent config value, and diffs it against the
//     files on disk;
//   • renders a MediaMTX edge config for any host.
// Nothing here assumes POWER, OPT1 or any particular machine.
//
// Pure functions take plain data so they can be tested; DB/agent access is in
// loadTopology()/discoverHostFacts() at the bottom.
// ─────────────────────────────────────────────────────────────────────────────

export const MEDIA_ROLES = ["media-origin", "media-edge", "turn", "ingress", "camera-receiver"] as const;
export type MediaRole = (typeof MEDIA_ROLES)[number];

export function isMediaRole(value: string): value is MediaRole {
  return (MEDIA_ROLES as readonly string[]).includes(value);
}

export type Protocol = "TCP" | "UDP" | "BOTH";

export type HostFacts = {
  lanIp?: string;
  tailnetIp?: string;
  publicIp?: string;
  cpus?: number;
  load1m?: number;
  memTotalMb?: number;
  /** Measured upload of the host's internet connection, in Mbps. */
  uplinkMbps?: number;
  /** Key of the home-router gateway this host sits behind (NAT). Absent = directly public. */
  gateway?: string;
  observedAt?: string;
};

export type TopologyHost = {
  id: string;
  name: string;
  agentUrl: string;
  /** The environment the core stack (and its reverse proxy) runs on. */
  isDefaultTarget: boolean;
  facts: HostFacts;
};

export type Placement = {
  key: string;
  role: MediaRole;
  envId: string;
  config: Record<string, any>;
};

export type PortForward = {
  name?: string;
  /** "3478" or "49160:49360" */
  external: string;
  /** Blank for ranges (forwarded to the same ports). */
  internal?: string;
  targetIp: string;
  protocol: Protocol;
};

export type Gateway = {
  key: string;
  publicIp: string;
  forwards: PortForward[];
};

export type Topology = {
  hosts: TopologyHost[];
  placements: Placement[];
  gateways: Gateway[];
};

// ── Role defaults ─────────────────────────────────────────────────────────────

export const ROLE_DEFAULTS: Record<MediaRole, Record<string, any>> = {
  "media-origin": {
    container: "unt_mediamtx", rtspPort: 8554, hlsPort: 8888, whepPort: 8889,
    iceUdpPort: 8189, rtmpPort: 1935, apiPort: 9997,
    /** Public names viewers reach the origin by — project config, set per placement. */
    publicHosts: [] as string[],
  },
  "media-edge": {
    container: "unt_edge_relay", hlsPort: 8887, whepPort: 8889, iceUdpPort: 8189, apiPort: 9997,
    image: "bluenviron/mediamtx:1.20.0",
    /** Serves the public HLS path through the proxy. */
    primary: false,
    /** Also answers WebRTC for the public (needs its ICE port reachable). */
    publicWhep: false,
  },
  turn: { container: "unt_coturn", listenPort: 3478, relayMin: 49160, relayMax: 49360 },
  ingress: { container: "nginx-proxy-manager", httpPort: 80, httpsPort: 443 },
  "camera-receiver": { container: "srt-manager", managerPort: 5050, srtlaMin: 5001, srtlaMax: 5025 },
};

export function placementConfig(p: Placement): Record<string, any> {
  return { ...ROLE_DEFAULTS[p.role], ...p.config };
}

// ── Public ports each role needs ─────────────────────────────────────────────

export type RequiredPort = { purpose: string; ports: string; protocol: Protocol; internal?: string };

const range = (a: number, b: number) => (a === b ? String(a) : `${a}:${b}`);

export function requiredPublicPorts(p: Placement): RequiredPort[] {
  const c = placementConfig(p);
  switch (p.role) {
    case "media-origin":
      return [
        { purpose: "WebRTC media (ICE)", ports: String(c.iceUdpPort), protocol: "BOTH" },
        { purpose: "OBS / RTMP ingest", ports: String(c.rtmpPort), protocol: "TCP" },
      ];
    case "media-edge":
      return c.publicWhep ? [{ purpose: "WebRTC media (ICE)", ports: String(c.iceUdpPort), protocol: "BOTH" }] : [];
    case "turn":
      return [
        { purpose: "TURN listener", ports: String(c.listenPort), protocol: "BOTH", internal: String(c.listenPort) },
        { purpose: "TURN relay range", ports: range(c.relayMin, c.relayMax), protocol: "UDP" },
      ];
    case "ingress":
      return [
        { purpose: "HTTP", ports: String(c.httpPort), protocol: "TCP" },
        { purpose: "HTTPS", ports: String(c.httpsPort), protocol: "TCP" },
      ];
    case "camera-receiver":
      return [{ purpose: "SRTLA camera pool", ports: range(c.srtlaMin, c.srtlaMax), protocol: "UDP" }];
  }
}

// ── Addressing ───────────────────────────────────────────────────────────────

/**
 * How `from` reaches `to`. Same host → the container name (the stack's own
 * docker network) or loopback; same home network → LAN; else the tailnet;
 * else the public address. Never assumes which machine is which.
 */
export function reachAddress(
  from: TopologyHost,
  to: TopologyHost,
  opts: { container?: string } = {},
): string | null {
  if (from.id === to.id) return opts.container || "127.0.0.1";
  const sameLan = Boolean(from.facts.gateway && from.facts.gateway === to.facts.gateway);
  if (sameLan && to.facts.lanIp) return to.facts.lanIp;
  if (from.facts.tailnetIp && to.facts.tailnetIp) return to.facts.tailnetIp;
  return to.facts.publicIp ?? null;
}

/** The internet-facing IP a host's traffic leaves from. */
export function uplinkIp(host: TopologyHost, gateways: Gateway[]): string | null {
  if (host.facts.gateway) return gateways.find((g) => g.key === host.facts.gateway)?.publicIp ?? null;
  return host.facts.publicIp ?? null;
}

// ── Port-forward checks ──────────────────────────────────────────────────────

export type ForwardCheck = {
  placement: string;
  host: string;
  purpose: string;
  ports: string;
  protocol: Protocol;
  status: "ok" | "missing" | "wrong-target" | "wrong-internal-port" | "wrong-protocol" | "public-host";
  detail: string;
};

const protoCovers = (have: Protocol, need: Protocol) => have === "BOTH" || have === need;

export function checkForwards(t: Topology): ForwardCheck[] {
  const out: ForwardCheck[] = [];
  for (const p of t.placements) {
    const host = t.hosts.find((h) => h.id === p.envId);
    if (!host) continue;
    for (const need of requiredPublicPorts(p)) {
      const base = { placement: p.key, host: host.name, purpose: need.purpose, ports: need.ports, protocol: need.protocol };
      const gw = host.facts.gateway ? t.gateways.find((g) => g.key === host.facts.gateway) : undefined;
      if (!gw) {
        out.push({ ...base, status: "public-host", detail: "directly public — open it in the host's firewall / security list" });
        continue;
      }
      const sameExternal = gw.forwards.filter((f) => f.external.replace(/-/g, ":") === need.ports);
      const match = sameExternal.find((f) => f.targetIp === host.facts.lanIp);
      if (!sameExternal.length) {
        out.push({ ...base, status: "missing", detail: `forward ${need.ports}/${need.protocol} → ${host.facts.lanIp ?? "?"} on ${gw.key}` });
      } else if (!match) {
        out.push({ ...base, status: "wrong-target", detail: `${need.ports} goes to ${sameExternal.map((f) => f.targetIp).join(", ")}, not ${host.facts.lanIp ?? "?"}` });
      } else if (!protoCovers(match.protocol, need.protocol) && !(need.protocol === "BOTH" && sameExternal.length >= 2)) {
        out.push({ ...base, status: "wrong-protocol", detail: `forwarded as ${match.protocol}, needs ${need.protocol}` });
      } else if (need.internal && match.internal && match.internal !== need.internal) {
        out.push({ ...base, status: "wrong-internal-port", detail: `internal port is ${match.internal}, must be ${need.internal}` });
      } else {
        out.push({ ...base, status: "ok", detail: `${match.name ?? "forward"} → ${match.targetIp}` });
      }
    }
  }
  return out;
}

// ── Warnings ─────────────────────────────────────────────────────────────────

export type Warning = { level: "warn" | "error"; message: string };

export function topologyWarnings(t: Topology): Warning[] {
  const w: Warning[] = [];
  const hostOf = (p: Placement) => t.hosts.find((h) => h.id === p.envId);
  const origins = t.placements.filter((p) => p.role === "media-origin");
  if (origins.length === 0) w.push({ level: "error", message: "no media-origin placed — nothing ingests or transcodes" });
  if (origins.length > 1) w.push({ level: "warn", message: `${origins.length} media-origins placed; edges and proxy routing assume one` });

  const origin = origins[0] ? hostOf(origins[0]) : undefined;
  const originUplink = origin ? uplinkIp(origin, t.gateways) : null;
  for (const e of t.placements.filter((p) => p.role === "media-edge")) {
    const h = hostOf(e);
    if (!h) continue;
    const up = uplinkIp(h, t.gateways);
    if (originUplink && up === originUplink) {
      w.push({
        level: "warn",
        message: `edge ${e.key} leaves through the same internet connection as the origin (${up}) — it spreads CPU, but adds NO viewer upload capacity`,
      });
    }
  }

  for (const h of t.hosts) {
    const roles = t.placements.filter((p) => p.envId === h.id);
    if (!roles.length) continue;
    const { load1m, cpus } = h.facts;
    if (load1m != null && cpus) {
      const perCore = load1m / cpus;
      if (perCore >= 2) {
        w.push({ level: "error", message: `${h.name} is saturated (load ${load1m.toFixed(1)} on ${cpus} cores) and runs ${roles.map((r) => r.role).join(", ")} — do not add work here` });
      } else if (perCore >= 1) {
        w.push({ level: "warn", message: `${h.name} is fully loaded (load ${load1m.toFixed(1)} on ${cpus} cores)` });
      }
    }
    if (!h.agentUrl) w.push({ level: "warn", message: `${h.name} has roles but no UNAXIS agent — UNAXIS can't deploy or check it` });
    if (!h.facts.lanIp && !h.facts.tailnetIp && !h.facts.publicIp) {
      w.push({ level: "warn", message: `${h.name} has no known address — run: unaxis media facts ${h.name} --discover` });
    }
  }

  for (const f of checkForwards(t)) {
    if (f.status !== "ok" && f.status !== "public-host") {
      w.push({ level: "error", message: `${f.placement}: ${f.purpose} ${f.ports}/${f.protocol} — ${f.status}: ${f.detail}` });
    }
  }
  return w;
}

// ── Capacity ─────────────────────────────────────────────────────────────────

export type CapacityLine = {
  uplink: string;
  hosts: string[];
  uplinkMbps: number | null;
  viewersAtHero: number | null;
  viewersAtLow: number | null;
};

/** Per-viewer delivery, in Mbps: the 4K main stream vs the camera sub-stream rung. */
export const VIEWER_MBPS = { hero: 10, low: 1.2 } as const;
/** Keep a fifth of the connection for everything else (site, API, ingest acks). */
const USABLE = 0.8;

export function capacityByUplink(t: Topology): CapacityLine[] {
  const servingRoles: MediaRole[] = ["media-origin", "media-edge"];
  const groups = new Map<string, CapacityLine>();
  for (const p of t.placements.filter((x) => servingRoles.includes(x.role))) {
    const h = t.hosts.find((x) => x.id === p.envId);
    if (!h) continue;
    // An origin behind an edge still serves WHEP directly unless told otherwise.
    const up = uplinkIp(h, t.gateways) ?? `unknown (${h.name})`;
    const line = groups.get(up) ?? { uplink: up, hosts: [], uplinkMbps: null, viewersAtHero: null, viewersAtLow: null };
    if (!line.hosts.includes(h.name)) line.hosts.push(h.name);
    const mbps = h.facts.uplinkMbps ?? null;
    if (mbps != null) line.uplinkMbps = Math.max(line.uplinkMbps ?? 0, mbps);
    groups.set(up, line);
  }
  for (const line of groups.values()) {
    if (line.uplinkMbps != null) {
      line.viewersAtHero = Math.floor((line.uplinkMbps * USABLE) / VIEWER_MBPS.hero);
      line.viewersAtLow = Math.floor((line.uplinkMbps * USABLE) / VIEWER_MBPS.low);
    }
  }
  return [...groups.values()];
}

// ── Derived config ───────────────────────────────────────────────────────────

export type DerivedConfig = {
  /** proxy-config/routes.json */
  mediaHlsUpstream: string | null;
  mediaWhepUpstream: string | null;
  /** coturn/turnserver.conf external-ip */
  turnExternalIp: string | null;
  /** mediamtx/mediamtx.yml webrtcAdditionalHosts */
  webrtcAdditionalHosts: string[] | null;
  /** .env — Tank's receiver manager */
  receiverManagerUrl: string | null;
  notes: string[];
};

export function renderDerivedConfig(t: Topology): DerivedConfig {
  const notes: string[] = [];
  const hostOf = (p?: Placement) => (p ? t.hosts.find((h) => h.id === p.envId) : undefined);
  // The core stack — and its reverse proxy and Tank — run on the default target.
  const core = t.hosts.find((h) => h.isDefaultTarget) ?? null;
  if (!core) notes.push("no default-target environment: can't tell where the proxy runs");

  const originP = t.placements.find((p) => p.role === "media-origin");
  const origin = hostOf(originP);
  const edges = t.placements.filter((p) => p.role === "media-edge");
  const hlsP = edges.find((e) => placementConfig(e).primary) ?? originP;
  const hlsHost = hostOf(hlsP);
  const whepP = edges.find((e) => placementConfig(e).primary && placementConfig(e).publicWhep) ?? originP;
  const whepHost = hostOf(whepP);

  const url = (from: TopologyHost | null, p: Placement | undefined, to: TopologyHost | undefined, portKey: string) => {
    if (!from || !p || !to) return null;
    const c = placementConfig(p);
    const addr = reachAddress(from, to, { container: c.container });
    return addr ? `http://${addr}:${c[portKey]}` : null;
  };

  const turnP = t.placements.find((p) => p.role === "turn");
  const turn = hostOf(turnP);
  let turnExternalIp: string | null = null;
  if (turn) {
    const gw = turn.facts.gateway ? t.gateways.find((g) => g.key === turn.facts.gateway) : undefined;
    if (gw && turn.facts.lanIp) turnExternalIp = `${gw.publicIp}/${turn.facts.lanIp}`;
    else if (turn.facts.publicIp) turnExternalIp = turn.facts.publicIp;
    else notes.push(`TURN host ${turn.name} has no public/LAN address`);
  }

  let webrtcAdditionalHosts: string[] | null = null;
  if (origin && originP) {
    const c = placementConfig(originP);
    webrtcAdditionalHosts = [origin.facts.lanIp ?? origin.facts.publicIp, ...(c.publicHosts ?? [])].filter(Boolean) as string[];
  }

  const recvP = t.placements.find((p) => p.role === "camera-receiver");
  const receiverManagerUrl = url(core, recvP, hostOf(recvP), "managerPort");

  return {
    mediaHlsUpstream: url(core, hlsP, hlsHost, "hlsPort"),
    mediaWhepUpstream: url(core, whepP, whepHost, "whepPort"),
    turnExternalIp,
    webrtcAdditionalHosts,
    receiverManagerUrl,
    notes,
  };
}

// ── Edge config ──────────────────────────────────────────────────────────────

/**
 * A MediaMTX config for an edge relay on `edge`, pulling on demand from the
 * origin. Mirrors the origin's HLS settings (plain fMP4, 2 s segments — the
 * origin moved OFF low-latency HLS on purpose; see mediamtx/mediamtx.yml), and
 * keeps the control API to loopback plus the control plane's addresses — the
 * hand-built relay let anyone who could reach it rewrite its paths.
 */
export function renderEdgeConfig(t: Topology, edgeKey: string): string {
  const edgeP = t.placements.find((p) => p.key === edgeKey && p.role === "media-edge");
  if (!edgeP) throw new Error(`no media-edge placement "${edgeKey}"`);
  const edge = t.hosts.find((h) => h.id === edgeP.envId);
  const originP = t.placements.find((p) => p.role === "media-origin");
  const origin = originP ? t.hosts.find((h) => h.id === originP.envId) : undefined;
  if (!edge || !origin || !originP) throw new Error("edge needs a placed media-origin to pull from");
  const e = placementConfig(edgeP);
  const o = placementConfig(originP);
  const originAddr = reachAddress(edge, origin);
  if (!originAddr) throw new Error(`${edge.name} has no route to ${origin.name} (no shared LAN, tailnet or public IP)`);
  if (originAddr === "127.0.0.1") throw new Error("an edge on the origin's own host adds nothing — place it elsewhere");

  // The control plane (default target) must be able to manage it; nothing else.
  const core = t.hosts.find((h) => h.isDefaultTarget);
  const apiIps = ["127.0.0.1/32", "::1/128"];
  for (const ip of [core?.facts.lanIp, core?.facts.tailnetIp]) if (ip) apiIps.push(`${ip}/32`);

  const additionalHosts = [edge.facts.lanIp, edge.facts.tailnetIp, edge.facts.publicIp].filter(Boolean);
  const y = (v: unknown) => JSON.stringify(v);
  return [
    "# Generated by UNAXIS (media-topology.ts) — do not edit on the host.",
    `# Edge relay ${edgeP.key} on ${edge.name}; pulls from origin ${origin.name} at ${originAddr}.`,
    "logLevel: info",
    "api: yes",
    `apiAddress: :${e.apiPort}`,
    "metrics: no",
    "pprof: no",
    "playback: no",
    "rtsp: no",
    "rtmp: no",
    "srt: no",
    "hls: yes",
    `hlsAddress: :${e.hlsPort}`,
    'hlsAllowOrigins: ["*"]',
    "hlsVariant: fmp4",
    "hlsSegmentCount: 6",
    "hlsSegmentDuration: 2s",
    "hlsAlwaysRemux: no",
    "webrtc: yes",
    `webrtcAddress: :${e.whepPort}`,
    `webrtcLocalUDPAddress: :${e.iceUdpPort}`,
    `webrtcAdditionalHosts: ${y(additionalHosts)}`,
    "authMethod: internal",
    "authInternalUsers:",
    "  - user: any",
    "    pass:",
    "    ips: []",
    "    permissions:",
    "      - action: read",
    "      - action: playback",
    "  - user: any",
    "    pass:",
    `    ips: ${y(apiIps)}`,
    "    permissions:",
    "      - action: api",
    "      - action: metrics",
    "paths:",
    "  '~^(.+)$':",
    `    source: rtsp://${originAddr}:${o.rtspPort}/$G1`,
    "    sourceOnDemand: yes",
    "    sourceOnDemandCloseAfter: 10s",
    "    rtspTransport: tcp",
    "",
  ].join("\n");
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatTopology(t: Topology): string[] {
  const lines: string[] = [];
  lines.push("HOSTS");
  for (const h of t.hosts) {
    const f = h.facts;
    const roles = t.placements.filter((p) => p.envId === h.id).map((p) => p.role);
    const load = f.load1m != null && f.cpus ? `load ${f.load1m.toFixed(1)}/${f.cpus}c` : "load ?";
    const up = uplinkIp(h, t.gateways);
    lines.push(`  ${h.name.padEnd(8)} lan=${f.lanIp ?? "-"} tailnet=${f.tailnetIp ?? "-"} uplink=${up ?? "-"}${f.uplinkMbps ? ` (${f.uplinkMbps} Mbps up)` : ""} ${load}${h.isDefaultTarget ? " [core]" : ""}`);
    lines.push(`           roles: ${roles.length ? roles.join(", ") : "—"}`);
  }
  lines.push("", "ROLES");
  for (const p of t.placements) {
    const h = t.hosts.find((x) => x.id === p.envId);
    const c = placementConfig(p);
    const extra = p.role === "media-edge" ? ` ${c.primary ? "primary-hls" : "standby"}${c.publicWhep ? "+whep" : ""}` : "";
    lines.push(`  ${p.key.padEnd(30)} ${p.role.padEnd(16)} → ${h?.name ?? "?"}${extra}`);
  }
  lines.push("", "PORT-FORWARDS");
  for (const f of checkForwards(t)) {
    const mark = f.status === "ok" ? "✓" : f.status === "public-host" ? "•" : "✗";
    lines.push(`  ${mark} ${f.placement.padEnd(30)} ${`${f.ports}/${f.protocol}`.padEnd(16)} ${f.purpose.padEnd(20)} ${f.status === "ok" ? "" : f.detail}`);
  }
  lines.push("", "VIEWER CAPACITY (per internet connection)");
  for (const c of capacityByUplink(t)) {
    const est = c.uplinkMbps == null
      ? "upload unknown — run: unaxis media facts <host> --uplink <Mbps>"
      : `${c.uplinkMbps} Mbps up → ~${c.viewersAtHero} viewers at 4K (${VIEWER_MBPS.hero} Mbps) · ~${c.viewersAtLow} at low (${VIEWER_MBPS.low} Mbps)`;
    lines.push(`  ${c.uplink.padEnd(18)} [${c.hosts.join(", ")}] ${est}`);
  }
  const warnings = topologyWarnings(t);
  lines.push("", warnings.length ? "WARNINGS" : "WARNINGS  none");
  for (const w of warnings) lines.push(`  ${w.level === "error" ? "✗" : "⚠"} ${w.message}`);
  return lines;
}
