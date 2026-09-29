import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Guards the zone Dockerfile overlay.
//
// Each zone image copies zones/<key>/src/app/ OVER the shared src/app/, so a
// file there silently replaces the shared route of the same path. Tank had 74
// such copies of API routes; eight had drifted, which is how the Follow Member
// API change, the SFX edit endpoint and heartbeat telemetry forwarding all
// existed in the repo while tank.unenter.live kept serving older behaviour.
//
// A zone may legitimately own pages and layouts. It may not hold a DIFFERENT
// copy of a shared API route: either keep it identical or delete it so the
// shared route wins.

const REPO = join(import.meta.dir, "..", "..");
const CORE_API = join(REPO, "src", "app", "api");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const normalise = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("zone app overlays", () => {
  const zonesDir = join(REPO, "zones");
  const zones = existsSync(zonesDir) ? readdirSync(zonesDir) : [];

  for (const zone of zones) {
    const zoneApi = join(zonesDir, zone, "src", "app", "api");
    if (!existsSync(zoneApi)) continue;

    test(`${zone}: no API route shadows a different shared route`, () => {
      const drifted = walk(zoneApi)
        .filter((file) => /\.(ts|tsx)$/.test(file))
        .map((file) => ({ file, core: join(CORE_API, relative(zoneApi, file)) }))
        .filter(({ core }) => existsSync(core))
        .filter(({ file, core }) => normalise(file) !== normalise(core))
        .map(({ file }) => relative(REPO, file).replace(/\\/g, "/"));

      expect(drifted).toEqual([]);
    });
  }
});
