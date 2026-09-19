import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Tank settings overlay wiring", () => {
  test("the public experience renders the compact settings redesign", () => {
    const source = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");

    expect(source).toContain(
      'import { CompactSettingsOverlay as SettingsOverlay } from "./components/CompactSettingsOverlay";',
    );
    expect(source).not.toContain(
      "  SettingsOverlay,\n  DEFAULT_SETTINGS,",
    );
  });

  test("settings expose only approved backgrounds and no unsaved base themes", () => {
    const source = readFileSync(
      join(import.meta.dir, "components", "CompactSettingsOverlay.tsx"),
      "utf8",
    );

    expect(source).toContain('aria-label="Approved Tank backgrounds"');
    expect(source).toContain("TANK_BACKGROUND_THEMES.map");
    expect(source).not.toContain("Base theme");
    expect(source).not.toContain("TANK_DESIGN_THEMES");
    expect(source).toContain('{ key: "background", label: "Background" }');
    expect(source).toContain('title="Panel Textures"');
    expect(source).toContain("TANK_BACKGROUND_THEMES.map((background)");
    expect(source).toContain("buildTankSpacingScale(value)");
    expect(source).toContain("resolveTankChromeTheme(settings.customTheme)");
    expect(source).not.toContain(
      "resolveTankTheme(settings.selectedBackgroundTheme, settings.customTheme)",
    );
  });

  test("the selected background is not used as the UI chrome theme", () => {
    const source = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");

    expect(source).toContain('designTheme="tank-neutral-chrome"');
    expect(source).not.toContain("designTheme={settings.selectedBackgroundTheme}");
  });
});
