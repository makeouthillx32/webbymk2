import { describe, expect, test } from "bun:test";
import {
  dumpFileName,
  forgeConfig,
  forgeHost,
  forgeRootUrl,
  parseBackupTarget,
  prunePlan,
  renderForgeEnv,
  tarSingle,
  untarSingle,
} from "./forge";

// Documentation address ranges only.
describe("addressing", () => {
  test("tailnet first, then LAN, then the agent host — never loopback", () => {
    expect(forgeHost({ tailnetIp: "100.64.0.2", lanIp: "10.10.0.2" }, "http://127.0.0.1:8888")).toBe("100.64.0.2");
    expect(forgeHost({ lanIp: "10.10.0.2" }, "http://127.0.0.1:8888")).toBe("10.10.0.2");
    expect(forgeHost({}, "http://10.10.0.9:8888")).toBe("10.10.0.9");
    expect(forgeHost({}, "http://127.0.0.1:8888")).toBeNull();
  });

  test("root URL is derived unless overridden", () => {
    expect(forgeRootUrl(forgeConfig(), "100.64.0.2")).toBe("http://100.64.0.2:3300/");
    expect(forgeRootUrl(forgeConfig({ rootUrl: "https://git.example.test" }), "x")).toBe("https://git.example.test/");
  });
});

describe("settings", () => {
  test("private by default and never phones out", () => {
    const env = renderForgeEnv(forgeConfig(), "100.64.0.2");
    for (const want of [
      "FORGEJO__service__DISABLE_REGISTRATION=true",
      "FORGEJO__service__REQUIRE_SIGNIN_VIEW=true",
      "FORGEJO__repository__DEFAULT_PRIVATE=private",
      "FORGEJO__cron_0x2E_update_checker__ENABLED=false",
      "FORGEJO__server__OFFLINE_MODE=true",
      "FORGEJO__server__SSH_PORT=2222",
      "FORGEJO__server__ROOT_URL=http://100.64.0.2:3300/",
    ]) expect(env).toContain(want);
  });

  test("bad numbers fall back to defaults", () => {
    const c = forgeConfig({ httpPort: "abc", sshPort: -1, backupTargets: "nope" });
    expect([c.httpPort, c.sshPort, c.backupTargets]).toEqual([3300, 2222, []]);
  });
});

describe("backups", () => {
  test("dump names sort by time", () => {
    expect(dumpFileName(new Date("2026-09-29T17:05:09.123Z"))).toBe("forge-20260929T170509Z.tar.gz");
  });

  test("prune keeps the newest and ignores other files", () => {
    const names = ["forge-20260101T000000Z.tar.gz", "notes.txt", "forge-20260103T000000Z.tar.gz", "forge-20260102T000000Z.tar.gz"];
    expect(prunePlan(names, 2)).toEqual(["forge-20260101T000000Z.tar.gz"]);
    expect(prunePlan(names, 5)).toEqual([]);
  });

  test("tarSingle and untarSingle round-trip one file", () => {
    const data = Buffer.from("hello dump");
    expect(untarSingle(tarSingle("forge-x.tar.gz", data))).toEqual({ name: "forge-x.tar.gz", data });
    expect(untarSingle(Buffer.alloc(100))).toBeNull();
  });
});

describe("backup targets", () => {
  const win = String.raw`C:\Users\a\backups\\`;
  test("env targets, absolute dirs, and Windows paths under WSL", () => {
    expect(parseBackupTarget("env:RELAY")).toEqual({ kind: "env", env: "RELAY" });
    expect(parseBackupTarget(win, "linux")).toEqual({ kind: "dir", path: "/mnt/c/Users/a/backups" });
    expect(parseBackupTarget(String.raw`C:\Users\a`, "win32")).toEqual({ kind: "dir", path: String.raw`C:\Users\a` });
    expect(parseBackupTarget("/srv/backups", "linux")).toEqual({ kind: "dir", path: "/srv/backups" });
  });

  test("relative paths and unmounted shares are refused with a reason", () => {
    expect(parseBackupTarget("backups", "linux")).toBeTypeOf("string");
    expect(parseBackupTarget(String.raw`\\nas\share`, "linux")).toBeTypeOf("string");
  });
});
