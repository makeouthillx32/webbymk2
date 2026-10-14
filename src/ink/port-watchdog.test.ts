import { afterAll, describe, expect, test } from "bun:test";
import net from "net";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  claimLock, decide, parsePublished, probePort,
  FAILS_BEFORE_REPAIR, MAX_REPAIRS_PER_HOUR, REPAIR_COOLDOWN_MS, STARTUP_GRACE_MS,
  type ContainerState, type PublishedContainer,
} from "./port-watchdog";

const T0 = 10_000_000;
const proxy: PublishedContainer = { name: "unt_proxy", startedAt: T0 - 3_600_000, tcpPorts: [3080] };
const dead = (c = proxy) => [{ container: c, deadPorts: c.tcpPorts }];
const ok   = (c = proxy) => [{ container: c, deadPorts: [] }];

describe("decide", () => {
  test("waits for consecutive failures before restarting", () => {
    const s = new Map<string, ContainerState>();
    for (let i = 1; i < FAILS_BEFORE_REPAIR; i++) expect(decide(s, dead(), T0 + i)).toEqual([]);
    expect(decide(s, dead(), T0 + 100)).toEqual([{ kind: "restart", container: "unt_proxy", deadPorts: [3080] }]);
  });

  test("a healthy round resets the count", () => {
    const s = new Map<string, ContainerState>();
    decide(s, dead(), T0);
    decide(s, ok(), T0 + 1);
    expect(decide(s, dead(), T0 + 2)).toEqual([]);
  });

  test("ignores a container still inside its startup grace", () => {
    const s = new Map<string, ContainerState>();
    const fresh = { ...proxy, startedAt: T0 };
    for (let i = 0; i < 5; i++) expect(decide(s, dead(fresh), T0 + i * 1000)).toEqual([]);
    expect(decide(s, dead(fresh), T0 + STARTUP_GRACE_MS)).toEqual([]);
    expect(decide(s, dead(fresh), T0 + STARTUP_GRACE_MS + 1)[0]?.kind).toBe("restart");
  });

  test("respects the cooldown, caps restarts, then escalates once", () => {
    const s = new Map<string, ContainerState>();
    let t = T0;
    const kinds: string[] = [];
    for (let i = 0; i < 40; i++) {
      t += 30_000;
      for (const a of decide(s, dead(), t)) kinds.push(a.kind);
    }
    expect(kinds.filter((k) => k === "restart").length).toBe(MAX_REPAIRS_PER_HOUR);
    expect(kinds.filter((k) => k === "escalate").length).toBe(1);
    const times: number[] = s.get("unt_proxy")!.repairs;
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(REPAIR_COOLDOWN_MS);
  });

  test("reports recovery after a repair", () => {
    const s = new Map<string, ContainerState>();
    decide(s, dead(), T0);
    decide(s, dead(), T0 + 1);
    expect(decide(s, ok(), T0 + 2)).toEqual([{ kind: "recovered", container: "unt_proxy" }]);
    expect(decide(s, ok(), T0 + 3)).toEqual([]);
  });
});

describe("parsePublished", () => {
  test("keeps running unt_ containers with non-loopback tcp ports", () => {
    const json = JSON.stringify([
      { Name: "/unt_proxy", State: { Status: "running", StartedAt: "2026-10-09T01:43:00Z" },
        NetworkSettings: { Ports: {
          "3080/tcp": [{ HostIp: "0.0.0.0", HostPort: "3080" }, { HostIp: "::", HostPort: "3080" }],
          "3081/tcp": [{ HostIp: "127.0.0.1", HostPort: "3081" }],
        } } },
      { Name: "/unt_coturn", State: { Status: "running", StartedAt: "x" },
        NetworkSettings: { Ports: { "3478/udp": [{ HostIp: "0.0.0.0", HostPort: "3478" }] } } },
      { Name: "/unt_tank", State: { Status: "running" }, NetworkSettings: { Ports: { "3000/tcp": null } } },
      { Name: "/unt_app", State: { Status: "exited" }, NetworkSettings: { Ports: { "3000/tcp": [{ HostIp: "0.0.0.0", HostPort: "3000" }] } } },
      { Name: "/other", State: { Status: "running" }, NetworkSettings: { Ports: { "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "80" }] } } },
    ]);
    expect(parsePublished(json)).toEqual([
      { name: "unt_proxy", startedAt: Date.parse("2026-10-09T01:43:00Z"), tcpPorts: [3080] },
    ]);
  });
});

describe("claimLock", () => {
  const dir = mkdtempSync(join(tmpdir(), "pwd-lock-"));
  const lock = join(dir, "lock");
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("first claimant owns it; a second is refused while fresh; stale is taken over", () => {
    expect(claimLock(lock, "a", T0)).toBe(true);
    expect(claimLock(lock, "b", T0 + 1_000)).toBe(false);
    expect(claimLock(lock, "a", T0 + 2_000)).toBe(true);
    expect(claimLock(lock, "b", T0 + 2_000 + 10 * 60_000)).toBe(true);
    expect(claimLock(lock, "a", T0 + 2_000 + 10 * 60_000 + 1)).toBe(false);
  });
});

describe("probePort", () => {
  const listen = (onConn: (s: net.Socket) => void) => new Promise<net.Server>((r) => {
    const srv = net.createServer(onConn).listen(0, "127.0.0.1", () => r(srv));
  });
  const portOf = (s: net.Server) => (s.address() as net.AddressInfo).port;

  test("a listener that holds the connection is ok", async () => {
    const srv = await listen(() => {});
    expect(await probePort("127.0.0.1", portOf(srv), 200)).toBe("ok");
    srv.close();
  });

  test("a banner is ok", async () => {
    const srv = await listen((s) => s.end("SSH-2.0-test\r\n"));
    expect(await probePort("127.0.0.1", portOf(srv), 200)).toBe("ok");
    srv.close();
  });

  test("accept-then-close with no bytes is dead (the Docker forwarder signature)", async () => {
    const srv = await listen((s) => s.destroy());
    expect(await probePort("127.0.0.1", portOf(srv), 500)).toBe("dead");
    srv.close();
  });

  test("a connect that is never answered is dead, not held open", async () => {
    // TEST-NET-1 (RFC 5737): routable nowhere, so the SYN goes unanswered.
    expect(await probePort("192.0.2.1", 9, 300)).toBe("dead");
  });

  test("refused is dead", async () => {
    const srv = await listen(() => {});
    const port = portOf(srv);
    await new Promise((r) => srv.close(r));
    expect(await probePort("127.0.0.1", port, 200)).toBe("dead");
  });
});
