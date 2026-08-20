import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { zoneVolumeMounts } from "./zone-templates.ts";

// Zone containers get no mounts by default. A zone that must reach real
// storage (Tank's archive drain) has to be given it explicitly — formatting a
// disk on the host does nothing for a container that was never handed it.

const KEY = "UNAXIS_ZONE_TANK_VOLUMES";
// Bun loads the project .env automatically, and the real deployment sets this
// key — so the "unset" case has to be established, not assumed.
const REAL = process.env[KEY];
beforeEach(() => { delete process.env[KEY]; });
afterEach(() => {
  if (REAL === undefined) delete process.env[KEY];
  else process.env[KEY] = REAL;
});

describe("zoneVolumeMounts", () => {
  test("no env means no mounts, so untouched zones are unchanged", () => {
    expect(zoneVolumeMounts("tank")).toEqual([]);
  });

  test("reads host:container pairs", () => {
    process.env[KEY] = "U:/tank-archive:/archive";
    expect(zoneVolumeMounts("tank")).toEqual(["U:/tank-archive:/archive"]);
  });

  test("supports several mounts and access modes", () => {
    process.env[KEY] = "U:/a:/a, D:/b:/b:ro";
    expect(zoneVolumeMounts("tank")).toEqual(["U:/a:/a", "D:/b:/b:ro"]);
  });

  test("drops malformed entries rather than breaking the whole zone", () => {
    // Compose rejects the entire file on a bad mount, which would take the
    // zone down over a typo in an optional setting.
    process.env[KEY] = "U:/good:/good,justapath,";
    expect(zoneVolumeMounts("tank")).toEqual(["U:/good:/good"]);
  });

  test("key lookup is case- and separator-insensitive", () => {
    process.env["UNAXIS_ZONE_MY_ZONE_VOLUMES"] = "U:/x:/x";
    expect(zoneVolumeMounts("my-zone")).toEqual(["U:/x:/x"]);
    delete process.env["UNAXIS_ZONE_MY_ZONE_VOLUMES"];
  });
});
