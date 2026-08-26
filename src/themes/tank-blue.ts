// themes/tank-blue.ts
// ─────────────────────────────────────────────────────────────────────────────
// Official Tank Arcade Blue theme (Base Background #557194).
//
// Matches the crafted Fishtank base background with asfalt-light texture overlay
// and provides seamless iOS status bar color integration (#557194).
// Light mode and dark mode are intentionally identical for Tank.
// ─────────────────────────────────────────────────────────────────────────────
import type { Theme, ThemeRadii, ThemeShadows } from "@/types/theme";

const defaultRadii: ThemeRadii = {
  radius: "0.5rem",
};

const defaultShadows: ThemeShadows = {
  shadow2xs: "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
  shadowXs: "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
  shadowSm: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
  shadow: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
  shadowMd: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10)",
  shadowLg: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10)",
  shadowXl: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10)",
  shadow2xl: "0 1px 3px 0px hsl(0 0% 0% / 0.25)",
};

const tankFonts = {
  sans: "Tank Highway Gothic, Plus Jakarta Sans, sans-serif",
  serif: "Source Serif 4, serif",
  mono: "Tank 5x5 Dots, JetBrains Mono, monospace",
};

// #557194 -> 213.33 27.04% 45.69% (Tank Base Blue)
// #6c8db5 -> 213.33 32.00% 56.67% (Highlight)
// #466080 -> 213.33 29.17% 38.43% (Midtone)
// #3b516c -> 213.33 29.41% 32.75% (Card / Border)

const tankBlueVariables: Record<string, string> = {
  "--background": "213.33 27.04% 45.69%", // #557194 (Tank Base Blue)
  "--foreground": "0 0% 95%",
  "--card": "213.33 29.41% 32.75%", // #3b516c
  "--card-foreground": "0 0% 95%",
  "--popover": "213.33 29.41% 32.75%",
  "--popover-foreground": "0 0% 95%",
  "--primary": "213.33 32.00% 56.67%", // #6c8db5
  "--primary-foreground": "0 0% 100%",
  "--secondary": "213.33 29.17% 38.43%", // #466080
  "--secondary-foreground": "0 0% 100%",
  "--muted": "213.33 27.04% 35.00%",
  "--muted-foreground": "213.33 32.00% 75.00%",
  "--accent": "213.33 32.00% 56.67%",
  "--accent-foreground": "0 0% 100%",
  "--destructive": "0 84.24% 60.20%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "213.33 29.41% 32.75%",
  "--input": "213.33 27.04% 30.00%",
  "--ring": "213.33 32.00% 56.67%",
  "--chart-1": "213.33 32.00% 56.67%",
  "--chart-2": "213.33 29.17% 38.43%",
  "--chart-3": "213.33 27.04% 45.69%",
  "--chart-4": "213.33 29.41% 32.75%",
  "--chart-5": "213.33 27.04% 35.00%",
  "--sidebar": "213.33 27.04% 45.69%",
  "--sidebar-foreground": "0 0% 95%",
  "--sidebar-primary": "213.33 32.00% 56.67%",
  "--sidebar-primary-foreground": "0 0% 100%",
  "--sidebar-accent": "213.33 29.17% 38.43%",
  "--sidebar-accent-foreground": "0 0% 100%",
  "--sidebar-border": "213.33 29.41% 32.75%",
  "--sidebar-ring": "213.33 32.00% 56.67%",
  "--font-sans": "Tank Highway Gothic, Plus Jakarta Sans, sans-serif",
  "--font-serif": "Source Serif 4, serif",
  "--font-mono": "Tank 5x5 Dots, JetBrains Mono, monospace",
  "--radius": "0.5rem",
  "--shadow-2xs": "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
  "--shadow-xs": "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
  "--shadow-sm": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
  "--shadow": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
  "--shadow-md": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10)",
  "--shadow-lg": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10)",
  "--shadow-xl": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10)",
  "--shadow-2xl": "0 1px 3px 0px hsl(0 0% 0% / 0.25)",
  "--tracking-normal": "0.5px",
  "--lt-status-bar": "#557194",
  "--lt-bg": "#557194",
  "--base-background": "#557194",
  "--base-texture-background": "url(https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-light.png)",
  "--base-texture-panel": "url(https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/otis-redding.png)",
  "--base-texture-inner-panel": "url(https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/ice-age.png)",
  "--base-texture-dark-panel": "url(https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/light-aluminum.png)",
  "--base-texture-metal": "url(https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/metal.png)",
};

const tankBlueTheme: Theme = {
  id: "tank-blue",
  name: "Tank Arcade Blue",
  description: "Official Tank Arcade Slate Blue theme with crafted asphalt background & iOS status bar (#557194).",
  previewColor: "#557194",
  fonts: tankFonts,
  radii: defaultRadii,
  shadows: defaultShadows,
  typography: {
    trackingNormal: "0.5px",
  },
  // Light and dark are identical on Tank
  light: tankBlueVariables,
  dark: tankBlueVariables,
};

export default tankBlueTheme;
