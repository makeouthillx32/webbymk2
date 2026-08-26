import { describe, expect, test } from "bun:test";
import { getLiveCameraConfigs } from "./roomLoopRefresher";

describe("Tank 2-Minute Room Loop Refresher Engine", () => {
  test("reads live SRT camera configurations from SRT receiver manager", async () => {
    const configs = await getLiveCameraConfigs();
    expect(Array.isArray(configs)).toBe(true);
    if (configs.length > 0) {
      const first = configs[0];
      expect(first.id).toBeDefined();
      expect(first.streamUser).toBeDefined();
      expect(first.streamKey).toBeDefined();
      expect(typeof first.videoOutPort).toBe("number");
    }
  });
});
