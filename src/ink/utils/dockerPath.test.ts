import { describe, expect, test } from "bun:test";
import { dockerCliHostPath } from "./dockerPath";

describe("Docker CLI host paths", () => {
  test("translates a WSL mounted drive for docker.exe", () => {
    expect(dockerCliHostPath("/mnt/z/WEBSITES/webbymk2/.env", { platform: "linux", isWsl: true }))
      .toBe("Z:\\WEBSITES\\webbymk2\\.env");
  });

  test("leaves native Linux and Windows paths alone", () => {
    expect(dockerCliHostPath("/srv/unenter/.env", { platform: "linux", isWsl: true })).toBe("/srv/unenter/.env");
    expect(dockerCliHostPath("Z:\\WEBSITES\\webbymk2", { platform: "win32", isWsl: false }))
      .toBe("Z:\\WEBSITES\\webbymk2");
  });
});
