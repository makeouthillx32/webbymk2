import { describe, expect, test } from "bun:test";
import {
  buildRuntimeRefreshUrl,
  shouldReloadForBuildChange,
} from "./runtimeReload";

describe("OBS Director runtime reload", () => {
  test("reloads only when both valid build ids differ", () => {
    expect(shouldReloadForBuildChange("old", "new")).toBe(true);
    expect(shouldReloadForBuildChange("same", "same")).toBe(false);
    expect(shouldReloadForBuildChange(null, "new")).toBe(false);
    expect(shouldReloadForBuildChange("old", null)).toBe(false);
  });

  test("cache-busts without discarding operator settings", () => {
    const refreshed = buildRuntimeRefreshUrl(
      "https://tank.unenter.live/obs/director?volume=80&crt=0",
      "new-build",
    );
    const url = new URL(refreshed);
    expect(url.pathname).toBe("/obs/director");
    expect(url.searchParams.get("volume")).toBe("80");
    expect(url.searchParams.get("crt")).toBe("0");
    expect(url.searchParams.get("_tank_build")).toBe("new-build");
  });
});
