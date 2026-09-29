import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hlsLevelForTankQuality,
  nextTankPlayerQuality,
  tankPlayerQualityLabel,
} from "./playerQuality";

describe("Tank player quality key", () => {
  test("cycles HIGH to MED to LOW", () => {
    expect(nextTankPlayerQuality("high")).toBe("medium");
    expect(nextTankPlayerQuality("medium")).toBe("low");
    expect(nextTankPlayerQuality("low")).toBe("high");
  });

  test("uses compact labels", () => {
    expect(tankPlayerQualityLabel("high")).toBe("HIGH");
    expect(tankPlayerQualityLabel("medium")).toBe("MED");
    expect(tankPlayerQualityLabel("low")).toBe("LOW");
  });

  test("selects low, middle, and high renditions by dimensions", () => {
    const levels = [
      { width: 1920, height: 1080, bitrate: 4_000_000 },
      { width: 640, height: 360, bitrate: 500_000 },
      { width: 1280, height: 720, bitrate: 1_500_000 },
    ];

    expect(hlsLevelForTankQuality(levels, "low")).toBe(1);
    expect(hlsLevelForTankQuality(levels, "medium")).toBe(2);
    expect(hlsLevelForTankQuality(levels, "high")).toBe(0);
  });

  test("returns no selection for an empty manifest", () => {
    expect(hlsLevelForTankQuality([], "high")).toBe(-1);
  });

  test("wires the keycap to the hero player and shared radius token", () => {
    const experience = readFileSync(
      join(import.meta.dir, "TankExperience.tsx"),
      "utf8",
    );
    const profile = readFileSync(
      join(import.meta.dir, "components", "ProfilePanel.tsx"),
      "utf8",
    );
    const settings = readFileSync(
      join(import.meta.dir, "components", "CompactSettingsOverlay.tsx"),
      "utf8",
    );

    expect(experience).toContain("data-tank-quality-key");
    expect(experience).toContain("quality={heroQuality}");
    expect(experience).toContain("setTimeout(() =>");
    expect(experience).toContain("customTheme={settings.customTheme}");
    expect(profile).toContain('var(--tank-border-radius, 0.25rem)');
    const toolbarStart = profile.indexOf('aria-label="Tank quick actions"');
    expect(toolbarStart).toBeGreaterThan(-1);
    expect(profile.slice(Math.max(0, toolbarStart - 350), toolbarStart)).not.toContain(
      "rounded-full",
    );
    expect(settings).toContain(
      '"--tank-border-radius": theme.borders.radius',
    );
  });
});
