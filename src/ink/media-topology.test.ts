import { describe, expect, test } from "bun:test";
import {
  capacityByUplink,
  checkForwards,
  reachAddress,
  renderDerivedConfig,
  renderEdgeConfig,
  topologyWarnings,
  type Topology,
  type TopologyHost,
} from "./media-topology";

// A home layout: two machines behind one router, an edge relay on the weaker
// one, and a cloud VM that could be added. Addresses are documentation ranges.
const home = (id: string, name: string, lanIp: string, extra: Partial<TopologyHost["facts"]> = {}, core = false): TopologyHost => ({
  id, name, agentUrl: `http://${lanIp}:8888`, isDefaultTarget: core,
  facts: { lanIp, gateway: "gateway@home", ...extra },
});
const power = home("p", "ORIGIN", "10.10.0.2", { tailnetIp: "100.64.0.2", cpus: 32, load1m: 6, uplinkMbps: 139 }, true);
const opt1 = home("o", "RELAY", "10.10.0.3", { tailnetIp: "100.64.0.3", cpus: 4, load1m: 10.4 });
const cloud: TopologyHost = {
  id: "c", name: "CLOUD1", agentUrl: "http://100.64.0.9:8888", isDefaultTarget: false,
  facts: { tailnetIp: "100.64.0.9", publicIp: "198.51.100.20", cpus: 4, load1m: 0.1, uplinkMbps: 2000 },
};

function live(): Topology {
  return {
    hosts: [power, opt1],
    gateways: [{
      key: "gateway@home",
      publicIp: "203.0.113.10",
      forwards: [
        { name: "NPM-HTTPS", external: "443", internal: "443", targetIp: "10.10.0.3", protocol: "TCP" },
        { name: "NPM-http", external: "80", internal: "80", targetIp: "10.10.0.3", protocol: "TCP" },
        { name: "obs-to tank", external: "1935", targetIp: "10.10.0.2", protocol: "TCP" },
        { name: "SRTLA Camera Pool", external: "5001:5025", targetIp: "10.10.0.3", protocol: "UDP" },
        { name: "stream_world_wide", external: "8189", targetIp: "10.10.0.2", protocol: "BOTH" },
        { name: "coturn-listen", external: "3478", internal: "3478", targetIp: "10.10.0.2", protocol: "BOTH" },
        { name: "coturn-relay", external: "49160:49360", targetIp: "10.10.0.2", protocol: "UDP" },
      ],
    }],
    placements: [
      { key: "media-origin@origin", role: "media-origin", envId: "p", config: { publicHosts: ["media.example.test"] } },
      { key: "media-edge@relay", role: "media-edge", envId: "o", config: { primary: true } },
      { key: "turn@origin", role: "turn", envId: "p", config: {} },
      { key: "ingress@relay", role: "ingress", envId: "o", config: {} },
      { key: "camera-receiver@relay", role: "camera-receiver", envId: "o", config: {} },
    ],
  };
}

describe("derived config reproduces the hand-written files", () => {
  test("every value the files hold today falls out of the placements", () => {
    const d = renderDerivedConfig(live());
    expect(d.mediaHlsUpstream).toBe("http://10.10.0.3:8887");
    expect(d.mediaWhepUpstream).toBe("http://unt_mediamtx:8889");
    expect(d.turnExternalIp).toBe("203.0.113.10/10.10.0.2");
    expect(d.webrtcAdditionalHosts).toEqual(["10.10.0.2", "media.example.test"]);
    expect(d.receiverManagerUrl).toBe("http://10.10.0.3:5050");
  });

  test("without a primary edge, public HLS comes straight from the origin", () => {
    const t = live();
    t.placements = t.placements.filter((p) => p.role !== "media-edge");
    expect(renderDerivedConfig(t).mediaHlsUpstream).toBe("http://unt_mediamtx:8888");
  });

  test("a directly public TURN host advertises only its public IP", () => {
    const t = live();
    t.hosts.push(cloud);
    t.placements = t.placements.map((p) => (p.role === "turn" ? { ...p, envId: "c" } : p));
    expect(renderDerivedConfig(t).turnExternalIp).toBe("198.51.100.20");
  });
});

describe("addressing never assumes a machine", () => {
  test("same host → container, same LAN → LAN, otherwise the tailnet", () => {
    expect(reachAddress(power, power, { container: "unt_mediamtx" })).toBe("unt_mediamtx");
    expect(reachAddress(power, opt1)).toBe("10.10.0.3");
    expect(reachAddress(cloud, power)).toBe("100.64.0.2");
  });
});

describe("warnings", () => {
  test("an edge behind the origin's own router is called out as adding no capacity", () => {
    const messages = topologyWarnings(live()).map((w) => w.message).join("\n");
    expect(messages).toContain("adds NO viewer upload capacity");
    expect(messages).toContain("RELAY is saturated");
  });

  test("an edge on another connection is not", () => {
    const t = live();
    t.hosts.push(cloud);
    t.placements = t.placements.map((p) => (p.role === "media-edge" ? { ...p, envId: "c" } : p));
    expect(topologyWarnings(t).map((w) => w.message).join("\n")).not.toContain("NO viewer upload capacity");
  });

  test("a port-forward typo is caught (e.g. an internal port typed as 478 instead of 3478)", () => {
    const t = live();
    t.gateways[0].forwards = t.gateways[0].forwards.map((f) => (f.name === "coturn-listen" ? { ...f, internal: "478" } : f));
    const bad = checkForwards(t).find((f) => f.purpose === "TURN listener");
    expect(bad?.status).toBe("wrong-internal-port");
  });

  test("a missing forward is caught, and today's router passes", () => {
    expect(checkForwards(live()).filter((f) => f.status !== "ok")).toEqual([]);
    const t = live();
    t.gateways[0].forwards = t.gateways[0].forwards.filter((f) => f.name !== "coturn-relay");
    expect(checkForwards(t).find((f) => f.purpose === "TURN relay range")?.status).toBe("missing");
  });
});

describe("capacity", () => {
  test("is counted per internet connection, not per host", () => {
    const [line] = capacityByUplink(live());
    expect(line.uplink).toBe("203.0.113.10");
    expect(line.hosts.sort()).toEqual(["ORIGIN", "RELAY"]);
    expect(line.viewersAtHero).toBe(11);
    expect(line.viewersAtLow).toBe(92);
  });
});

describe("edge config", () => {
  test("pulls from the origin over the best path and locks its API down", () => {
    const t = live();
    const yml = renderEdgeConfig(t, "media-edge@relay");
    expect(yml).toContain("source: rtsp://10.10.0.2:8554/$G1");
    expect(yml).toContain("hlsVariant: fmp4");
    expect(yml).not.toContain("lowLatency");
    // API only from loopback and the control plane.
    expect(yml).toContain('ips: ["127.0.0.1/32","::1/128","10.10.0.2/32","100.64.0.2/32"]');
  });

  test("a cloud edge reaches the origin over the tailnet", () => {
    const t = live();
    t.hosts.push(cloud);
    t.placements.push({ key: "media-edge@cloud1", role: "media-edge", envId: "c", config: {} });
    expect(renderEdgeConfig(t, "media-edge@cloud1")).toContain("source: rtsp://100.64.0.2:8554/$G1");
  });

  test("refuses an edge on the origin's own host", () => {
    const t = live();
    t.placements.push({ key: "media-edge@origin", role: "media-edge", envId: "p", config: {} });
    expect(() => renderEdgeConfig(t, "media-edge@origin")).toThrow();
  });
});
