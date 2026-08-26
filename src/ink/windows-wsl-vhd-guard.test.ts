import { describe, expect, test } from "bun:test";
import {
  assessDockerWslVhd,
  formatDockerWslVhdReport,
  type DockerWslVhdReport,
} from "./windows-wsl-vhd-guard";

function report(overrides: Partial<DockerWslVhdReport> = {}): DockerWslVhdReport {
  return {
    supported: true,
    settingsPath: "C:\\Users\\operator\\AppData\\Roaming\\Docker\\settings-store.json",
    configuredRoot: "Z:\\DockerDesktopWSL",
    resolvedRoot: "Z:\\DockerDesktopWSL",
    rootLinkType: null,
    expectedOwner: "POWER\\operator",
    recentAccessDenied: false,
    accessDeniedLog: null,
    vhds: [
      { path: "Z:\\DockerDesktopWSL\\main\\ext4.vhdx", exists: true, owner: "POWER\\operator", sizeBytes: 128 },
      { path: "Z:\\DockerDesktopWSL\\disk\\docker_data.vhdx", exists: true, owner: "POWER\\operator", sizeBytes: 256 },
    ],
    ...overrides,
  };
}

describe("Docker WSL VHD guard", () => {
  test("accepts a direct root whose VHD ownership matches the operator", () => {
    expect(assessDockerWslVhd(report())).toEqual({
      severity: "ok",
      ownerMismatch: false,
      missingVhd: false,
      junctionBacked: false,
    });
  });

  test("escalates the proven access-denied plus owner-mismatch failure", () => {
    const broken = report({
      recentAccessDenied: true,
      accessDeniedLog: "backend.log",
      vhds: [
        { path: "Z:\\DockerDesktopWSL\\main\\ext4.vhdx", exists: true, owner: "BUILTIN\\Administrators", sizeBytes: 128 },
        { path: "Z:\\DockerDesktopWSL\\disk\\docker_data.vhdx", exists: true, owner: "BUILTIN\\Administrators", sizeBytes: 256 },
      ],
    });
    expect(assessDockerWslVhd(broken).severity).toBe("critical");
    const output = formatDockerWslVhdReport(broken).join("\n");
    expect(output).toContain("SAFE RECOVERY BOUNDARY");
    expect(output).toContain("/setowner \"POWER\\operator\"");
    expect(output).toContain("Never delete, recreate, reset, or compact");
  });

  test("warns about a junction even when the disks are otherwise healthy", () => {
    expect(assessDockerWslVhd(report({
      configuredRoot: "C:\\Users\\operator\\AppData\\Local\\Docker\\wsl",
      resolvedRoot: "Z:\\DockerDesktopWSL",
      rootLinkType: "Junction",
    })).severity).toBe("warning");
  });

  test("does not mistake a large VHD for corruption", () => {
    const large = report({
      vhds: [
        { path: "Z:\\DockerDesktopWSL\\main\\ext4.vhdx", exists: true, owner: "POWER\\operator", sizeBytes: 734_369_153_024 },
        { path: "Z:\\DockerDesktopWSL\\disk\\docker_data.vhdx", exists: true, owner: "POWER\\operator", sizeBytes: 1_000_000 },
      ],
    });
    expect(assessDockerWslVhd(large).severity).toBe("ok");
    expect(formatDockerWslVhdReport(large).join("\n")).toContain("683.9 GiB");
  });
});
