import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Tank's image lays core's src/app/api down first and then copies
// zones/tank/src/app over the top (zones/tank/Dockerfile). Any route file under
// zones/tank/src/app/api therefore SILENTLY REPLACES core's route of the same
// path. 59 of the 60 such copies were identical and the 60th (director/mode)
// had drifted: the staff 401/403 fix and housemate enrollment never reached Tank
// (2026-09-19). Tank's API routes live in src/app/api only; shared logic in
// src/zones/tank/server/*Http.ts.
describe("Tank zone overlay", () => {
  test("carries no API route copies that would override core's", () => {
    const overlay = join(import.meta.dir, "..", "..", "..", "zones", "tank", "src", "app", "api");
    expect(existsSync(overlay)).toBe(false);
  });
});
