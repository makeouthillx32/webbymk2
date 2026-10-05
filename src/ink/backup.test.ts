import { describe, expect, test } from "bun:test";
import { backupArgs, backupConfig, isDue, repoUrl, validName, wslEnvFor, dockerBindPath } from "./backup";

describe("schedule", () => {
  const at = (s: string) => new Date(s);
  test("due once the slot has passed today and the last run was before it", () => {
    expect(isDue("03:30", undefined, at("2026-10-01T03:31:00"))).toBe(true);
    expect(isDue("03:30", "2026-09-30T03:31:00", at("2026-10-01T03:31:00"))).toBe(true);
  });
  test("not due before the slot, after today's run, or when off", () => {
    expect(isDue("03:30", undefined, at("2026-10-01T03:29:00"))).toBe(false);
    expect(isDue("03:30", "2026-10-01T03:35:00", at("2026-10-01T09:00:00"))).toBe(false);
    expect(isDue(null, undefined, at("2026-10-01T12:00:00"))).toBe(false);
    expect(isDue("3h", undefined, at("2026-10-01T12:00:00"))).toBe(false);
  });
});

describe("restic invocation", () => {
  const cfg = backupConfig({
    sources: [{ name: "app", path: "/work/app" }, { name: "recv", path: "/work/recv" }],
    targets: [{ name: "local", kind: "dir", path: "/backups" }, { name: "relay", kind: "env", env: "RELAY", port: 9000 }],
  });

  test("sources are mounted under /data/<name> and tagged with the host", () => {
    const args = backupArgs(cfg, "ORIGIN");
    expect(args.slice(0, 3)).toEqual(["backup", "--host", "ORIGIN"]);
    expect(args.slice(-2)).toEqual(["/data/app", "/data/recv"]);
    expect(args).toContain("node_modules");
  });

  test("repository URLs per target kind", () => {
    expect(repoUrl(cfg.targets[0])).toBe("/repo/local");
    expect(repoUrl(cfg.targets[1], "100.64.0.3")).toBe("rest:http://100.64.0.3:9000/workspace");
    expect(() => repoUrl(cfg.targets[1], null)).toThrow();
  });

  test("defaults and validation", () => {
    expect(backupConfig({}).schedule).toBe("03:30");
    expect(backupConfig({ schedule: null }).schedule).toBeNull();
    expect(validName("l0v3")).toBe(true);
    expect(validName("Bad Name")).toBe(false);
  });
});

describe("WSL hands docker.exe only what WSLENV lists", () => {
  test("restic's variables are added, nothing already there is duplicated", () => {
    expect(wslEnvFor(["RESTIC_PASSWORD", "RESTIC_REPOSITORY"], "")).toBe("RESTIC_PASSWORD:RESTIC_REPOSITORY");
    expect(wslEnvFor(["RESTIC_REPOSITORY"], "GIT_CONFIG_COUNT:RESTIC_REPOSITORY/u")).toBe("GIT_CONFIG_COUNT:RESTIC_REPOSITORY/u");
    expect(wslEnvFor(["A"], "B")).toBe("B:A");
  });
});

describe("docker gets drive-letter paths", () => {
  test("WSL and Windows forms both become X:/...", () => {
    expect(dockerBindPath("/mnt/z/WEBSITES/webbymk2")).toBe("Z:/WEBSITES/webbymk2");
    expect(dockerBindPath("Z:/WEBSITES/webbymk2")).toBe("Z:/WEBSITES/webbymk2");
    expect(dockerBindPath("C:\\Users\\skill\\AppData\\Roaming\\unaxis")).toBe("C:/Users/skill/AppData/Roaming/unaxis");
    expect(dockerBindPath("/var/lib/thing")).toBe("/var/lib/thing");
  });
});
