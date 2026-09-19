import { describe, expect, test } from "bun:test";
import {
  getTankDesignTheme,
  resolveTankTheme,
  buildTankThemeCssVariables,
  formatTextureUrl,
  TANK_DESIGN_THEMES,
  TANK_BACKGROUND_THEMES,
  getTankBackgroundTheme,
  TANK_TEXTURE_PATTERNS,
  TANK_NEUTRAL_CHROME_THEME,
  resolveTankChromeTheme,
  buildTankSpacingScale,
} from "./theme";

describe("Tank Design Theme Tokens & Presets (Wave 1-3)", () => {
  test("registers all 4 standard design theme presets", () => {
    expect(TANK_DESIGN_THEMES.length).toBeGreaterThanOrEqual(4);
    const ids = TANK_DESIGN_THEMES.map((t) => t.id);
    expect(ids).toContain("tank-arcade-blue");
    expect(ids).toContain("tank-arcade-green");
    expect(ids).toContain("tank-heavy-industrial");
    expect(ids).toContain("tank-retro-cyber");
  });

  test("retrieves design theme by ID with resilient fallback", () => {
    const blue = getTankDesignTheme("tank-arcade-blue");
    expect(blue.id).toBe("tank-arcade-blue");
    expect(blue.colors.background).toBe("#557194");
    expect(blue.borders.style).toBe("outset");

    const green = getTankDesignTheme("tank-arcade-green");
    expect(green.id).toBe("tank-arcade-green");
    expect(green.colors.background).toBe("#637F6D");

    const industrial = getTankDesignTheme("tank-heavy-industrial");
    expect(industrial.id).toBe("tank-heavy-industrial");
    expect(industrial.colors.primary).toBe("#f59e0b");

    const cyber = getTankDesignTheme("tank-retro-cyber");
    expect(cyber.id).toBe("tank-retro-cyber");
    expect(cyber.colors.primary).toBe("#10b981");

    // Fallback to default when unknown
    const fallback = getTankDesignTheme("unknown-theme-xyz");
    expect(fallback.id).toBe("tank-arcade-blue");
  });

  test("builds complete CSS custom properties covering all 6 design domains", () => {
    const theme = getTankDesignTheme("tank-arcade-blue");
    const vars = buildTankThemeCssVariables(theme);

    // 1. Fonts
    expect(vars["--tank-font-primary"]).toContain("Highway Gothic");
    expect(vars["--tank-font-secondary"]).toContain("5x5 Dots");

    // 2. Colors
    expect(vars["--tank-color-primary"]).toBe("#6c8db5");
    expect(vars["--tank-color-secondary"]).toBe("#466080");
    expect(vars["--tank-color-tertiary"]).toBe("#3b516c");
    expect(vars["--tank-color-light"]).toBe("#f3f4f6");
    expect(vars["--tank-color-dark"]).toBe("#111827");
    expect(vars["--tank-color-background"]).toBe("#557194");
    expect(vars["--tank-color-link"]).toBe("#38bdf8");
    expect(vars["--tank-color-danger"]).toBe("#ef4444");
    expect(vars["--tank-color-text-light"]).toBe("#f9fafb");
    expect(vars["--tank-color-text-dark"]).toBe("#241f14");

    // 3. Textures
    expect(vars["--tank-texture-background"]).toMatch(/^url\(.+\)$/);
    expect(vars["--tank-texture-panel"]).toMatch(/^url\(.+\)$/);
    expect(vars["--tank-texture-inner-panel"]).toMatch(/^url\(.+\)$/);
    expect(vars["--tank-texture-dark-panel"]).toMatch(/^url\(.+\)$/);
    expect(vars["--tank-texture-metal"]).toMatch(/^url\(.+\)$/);

    // Backward compatibility alias
    expect(vars["--tank-panel-texture"]).toBe(vars["--tank-texture-panel"]);

    // 4. Borders
    expect(vars["--tank-border-radius"]).toBe("0.5rem");
    expect(vars["--tank-border-width"]).toBe("3px");
    expect(vars["--tank-border-style"]).toBe("outset");

    // 5. Spacing
    expect(vars["--tank-spacing-base"]).toBe("1rem");
    expect(vars["--tank-panel-padding"]).toBe("1rem");
    expect(vars["--tank-module-gap"]).toBe("0.75rem");

    // 6. Animations
    expect(vars["--tank-anim-duration"]).toBe("150ms");
    expect(vars["--tank-anim-glow"]).toContain("rgba");
    expect(vars["--tank-anim-easing"]).toContain("cubic-bezier");

    // Root sync
    expect(vars["--lt-status-bar"]).toBe("#557194");
    expect(vars["--lt-bg"]).toBe("#557194");
    expect(vars["--background"]).toBe("#557194");
  });

  test("disables animation tokens when animations are turned off", () => {
    const baseTheme = getTankDesignTheme("tank-arcade-blue");
    const disabledTheme = {
      ...baseTheme,
      animations: {
        ...baseTheme.animations,
        enabled: false,
      },
    };

    const vars = buildTankThemeCssVariables(disabledTheme);
    expect(vars["--tank-anim-duration"]).toBe("0ms");
    expect(vars["--tank-anim-glow"]).toBe("none");
  });

  test("formats texture URLs correctly", () => {
    expect(formatTextureUrl("https://example.com/texture.png")).toBe(
      'url("https://example.com/texture.png")',
    );
    expect(formatTextureUrl('url("https://example.com/texture.png")')).toBe(
      'url("https://example.com/texture.png")',
    );
    expect(formatTextureUrl("linear-gradient(180deg, #000, #fff)")).toBe(
      "linear-gradient(180deg, #000, #fff)",
    );
    expect(formatTextureUrl("none")).toBe("none");
    expect(formatTextureUrl(null)).toBe("none");
    expect(formatTextureUrl("")).toBe("none");
  });

  test("maintains backward compatibility with TANK_BACKGROUND_THEMES registry", () => {
    expect(TANK_BACKGROUND_THEMES).toHaveLength(2);
    expect(TANK_BACKGROUND_THEMES.map((theme) => theme.label)).toEqual([
      "OG Green",
      "Arcade Blue",
    ]);
    const blueBg = getTankBackgroundTheme("tank-arcade-blue");
    expect(blueBg.statusBarHex).toBe("#557194");
    expect(blueBg.palette.base).toBe("#557194");

    const greenBg = getTankBackgroundTheme("tank-arcade-green");
    expect(greenBg.statusBarHex).toBe("#637F6D");
    expect(greenBg.palette.base).toBe("#637F6D");

    expect(getTankBackgroundTheme("tank-heavy-industrial").id).toBe(
      "tank-arcade-blue",
    );
  });

  test("keeps approved backgrounds independent from neutral UI chrome", () => {
    const chrome = resolveTankChromeTheme();
    const green = getTankBackgroundTheme("tank-arcade-green");
    const blue = getTankBackgroundTheme("tank-arcade-blue");

    expect(chrome.id).toBe("tank-neutral-chrome");
    expect(chrome.colors.secondary).toBe("#6e737b");
    expect(chrome.colors.secondary).not.toBe(green.palette.midtone);
    expect(chrome.colors.secondary).not.toBe(blue.palette.midtone);
    expect(chrome.textures.panel).toBe(TANK_NEUTRAL_CHROME_THEME.textures.panel);
  });

  test("still applies explicit UI customization over neutral chrome", () => {
    const chrome = resolveTankChromeTheme({
      colors: { secondary: "#bc6ff1" },
      textures: { panel: "https://db.unenter.live/custom-ui-panel.png" },
    });

    expect(chrome.colors.secondary).toBe("#bc6ff1");
    expect(chrome.textures.panel).toBe("https://db.unenter.live/custom-ui-panel.png");
  });

  test("maps the spacing dial to visibly distinct compact and roomy layouts", () => {
    const compact = buildTankSpacingScale(0.25);
    const standard = buildTankSpacingScale(1);
    const roomy = buildTankSpacingScale(2);

    expect(compact).toEqual({ base: "0.25rem", panelPadding: "0.5rem", gap: "0.25rem" });
    expect(standard).toEqual({ base: "1rem", panelPadding: "1.35rem", gap: "0.85rem" });
    expect(roomy).toEqual({ base: "2rem", panelPadding: "2.5rem", gap: "1.5rem" });
    expect(buildTankSpacingScale(Number.NaN)).toEqual(standard);
  });

  test("resolves theme with custom texture overrides across all 5 slots", () => {
    const customTextures = {
      background: "https://db.unenter.live/custom-bg.png",
      panel: "https://db.unenter.live/custom-panel.png",
      innerPanel: "https://db.unenter.live/custom-inner.png",
      darkPanel: "https://db.unenter.live/custom-dark.png",
      metal: "https://db.unenter.live/custom-metal.png",
    };

    const resolved = resolveTankTheme("tank-arcade-blue", { textures: customTextures });
    expect(resolved.textures.background).toBe("https://db.unenter.live/custom-bg.png");
    expect(resolved.textures.panel).toBe("https://db.unenter.live/custom-panel.png");
    expect(resolved.textures.innerPanel).toBe("https://db.unenter.live/custom-inner.png");
    expect(resolved.textures.darkPanel).toBe("https://db.unenter.live/custom-dark.png");
    expect(resolved.textures.metal).toBe("https://db.unenter.live/custom-metal.png");

    const vars = buildTankThemeCssVariables(resolved);
    expect(vars["--tank-texture-background"]).toBe('url("https://db.unenter.live/custom-bg.png")');
    expect(vars["--tank-texture-panel"]).toBe('url("https://db.unenter.live/custom-panel.png")');
    expect(vars["--tank-panel-texture"]).toBe('url("https://db.unenter.live/custom-panel.png")');
  });

  test("resolves theme with custom color and border overrides", () => {
    const customColors = {
      primary: "#e11d48",
      background: "#09090b",
      link: "#f43f5e",
    };
    const customBorders = {
      radius: "1rem",
      width: "4px",
      style: "groove" as const,
    };

    const resolved = resolveTankTheme("tank-heavy-industrial", {
      colors: customColors,
      borders: customBorders,
    });

    expect(resolved.colors.primary).toBe("#e11d48");
    expect(resolved.colors.background).toBe("#09090b");
    expect(resolved.colors.link).toBe("#f43f5e");
    // Preserves un-overridden secondary color
    expect(resolved.colors.secondary).toBe("#374151");
    // Syncs statusBarHex with background
    expect(resolved.statusBarHex).toBe("#09090b");

    expect(resolved.borders.radius).toBe("1rem");
    expect(resolved.borders.width).toBe("4px");
    expect(resolved.borders.style).toBe("groove");

    const vars = buildTankThemeCssVariables(resolved);
    expect(vars["--tank-color-primary"]).toBe("#e11d48");
    expect(vars["--tank-border-radius"]).toBe("1rem");
    expect(vars["--lt-status-bar"]).toBe("#09090b");
  });

  test("exports comprehensive TANK_TEXTURE_PATTERNS catalog", () => {
    expect(TANK_TEXTURE_PATTERNS.length).toBeGreaterThanOrEqual(16);
    const ids = TANK_TEXTURE_PATTERNS.map((p) => p.id);
    expect(ids).toContain("none");
    expect(ids).toContain("asphalt-light");
    expect(ids).toContain("asphalt-dark");
    expect(ids).toContain("light-aluminum");
    expect(ids).toContain("metal");
    expect(ids).toContain("ice-age");
    expect(ids).toContain("concrete");
  });
});
