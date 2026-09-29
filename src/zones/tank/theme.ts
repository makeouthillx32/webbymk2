// src/zones/tank/theme.ts
// ─────────────────────────────────────────────────────────────────────────────
// Broadened visual design theme registry for the Tank zone.
//
// Unifies Fonts, Colors, Textures, Borders, Spacing, and Animations into
// first-class design tokens aligned with unenter.live themes, expanded with
// skeuomorphic industrial textures, metal bevels, and tactile styling.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_ASSET_BASE =
  "https://db.unenter.live/storage/v1/object/public/site-assets";

export type TankThemeFontFace = {
  family: string;
  url: string;
  format: string;
  weight?: string;
  style?: string;
};

export type TankTheme = {
  id: string;
  label: string;
  fonts: {
    /** Big glowing LED numeric readouts (live/offline, cams-online count). */
    display: string;
    /** Small pixel dot-matrix readouts. */
    dotMatrix: string;
    /** Condensed uppercase labels — room names, button text. */
    label: string;
    /** Wider condensed variant for headers. */
    labelWide: string;
    /** Stamp/badge accent font. */
    stamp: string;
  };
  fontFaces: TankThemeFontFace[];
  images: {
    background: string;
    buttonBlue: string;
    buttonGray: string;
    buttonOrange: string;
    buttonRed: string;
    aluminumTexture: string;
    metalTexture: string;
    screwTopLeft: string;
    screwTopRight: string;
    screwBottomLeft: string;
    screwBottomRight: string;
  };
};

function assetUrl(theme: string, kind: "images" | "fonts", file: string): string {
  return `${SUPABASE_ASSET_BASE}/tank-theme/${theme}/${kind}/${file}`;
}

export const TANK_ARCADE_THEME: TankTheme = {
  id: "fishtank-arcade",
  label: "Arcade Console",
  fonts: {
    display: "Tank Alarm Clock",
    dotMatrix: "Tank 5x5 Dots",
    label: "Tank Highway Gothic",
    labelWide: "Tank Highway Gothic Wide",
    stamp: "Tank Army Rust",
  },
  fontFaces: [
    {
      family: "Tank Alarm Clock",
      url: assetUrl("fishtank-arcade", "fonts", "alarmclock.ttf"),
      format: "truetype",
    },
    {
      family: "Tank 5x5 Dots",
      url: assetUrl("fishtank-arcade", "fonts", "5x5-Dots.woff"),
      format: "woff",
    },
    {
      family: "Tank Highway Gothic",
      url: assetUrl("fishtank-arcade", "fonts", "highway_gothic.ttf"),
      format: "truetype",
      weight: "600",
    },
    {
      family: "Tank Highway Gothic Wide",
      url: assetUrl("fishtank-arcade", "fonts", "highway_gothic_wide.ttf"),
      format: "truetype",
      weight: "600",
    },
    {
      family: "Tank Army Rust",
      url: assetUrl("fishtank-arcade", "fonts", "army.ttf"),
      format: "truetype",
      weight: "800",
    },
  ],
  images: {
    background: assetUrl("fishtank-arcade", "images", "green-bg.png"),
    buttonBlue: assetUrl("fishtank-arcade", "images", "console-button-long-blue.png"),
    buttonGray: assetUrl("fishtank-arcade", "images", "console-button-long-gray.png"),
    buttonOrange: assetUrl("fishtank-arcade", "images", "console-button-long-orange.png"),
    buttonRed: assetUrl("fishtank-arcade", "images", "console-button-long-red.png"),
    aluminumTexture: assetUrl("fishtank-arcade", "images", "light-aluminum-comp.webp"),
    metalTexture: assetUrl("fishtank-arcade", "images", "metal-small-comp.webp"),
    screwTopLeft: assetUrl("fishtank-arcade", "images", "screw-top-left.png"),
    screwTopRight: assetUrl("fishtank-arcade", "images", "screw-top-right.png"),
    screwBottomLeft: assetUrl("fishtank-arcade", "images", "screw-bottom-left.png"),
    screwBottomRight: assetUrl("fishtank-arcade", "images", "screw-bottom-right.png"),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Broadened Tank Theme Token Contracts
// ─────────────────────────────────────────────────────────────────────────────

export interface TankThemeFonts {
  /** Primary uppercase UI labels, navigation buttons, console titles */
  primary: string;
  /** Secondary data font: timecodes, camera IDs, technical telemetry */
  secondary: string;
  /** Optional vintage LED numeric display */
  display?: string;
  /** Optional badge stamp accent font */
  stamp?: string;
}

export interface TankThemeColors {
  /** Primary interactive accent (e.g. cyan #06b6d4, gold #f59e0b) */
  primary: string;
  /** Secondary chassis element shade (e.g. #466080) */
  secondary: string;
  /** Tertiary border / subtle highlight tone (e.g. #6c8db5) */
  tertiary: string;
  /** Surface light neutral tone */
  light: string;
  /** Deep recessed bay / backdrop neutral tone */
  dark: string;
  /** Viewport / chassis base background color */
  background: string;
  /** Anchor / doorway teleport breadcrumb accent */
  link: string;
  /** Alert / REC indicator / destructive actions */
  danger: string;
  /** Light high-contrast text on dark containers */
  lightText: string;
  /** Industrial stamped text on metal surfaces */
  darkText: string;
}

export interface TankThemeTextures {
  /** Full viewport wallpaper texture */
  background: string;
  /** Outer ChromePanel chassis surface texture */
  panel: string;
  /** Inset camera bay & soundboard surface texture */
  innerPanel: string;
  /** Chat box & terminal backdrop texture */
  darkPanel: string;
  /** Metal bracket plates & bezel trims texture */
  metal: string;
}

export interface TankThemeBorders {
  /** Border radius scale (e.g. '0.375rem', '0.5rem', '0.75rem') */
  radius: string;
  /** Primary border thickness (e.g. '2px', '3px') */
  width: string;
  /** Border style */
  style: "outset" | "solid" | "groove" | "double";
  /** 3D bevel lighting elevation */
  bevel: "flat" | "subtle" | "industrial" | "heavy";
}

export interface TankThemeSpacing {
  /** Base spacing unit (e.g. '1rem' / 16px) */
  base: string;
  /** Inner screw-clearance padding (e.g. '1rem') */
  panelPadding: string;
  /** Spacing between console modules (e.g. '0.75rem') */
  gap: string;
}

export interface TankThemeAnimations {
  /** Master toggle for smooth transitions & glow */
  enabled: boolean;
  /** Transition duration (e.g. '150ms') */
  duration: string;
  /** Neon / LED glow bloom style */
  glow: string;
  /** Animation easing curve */
  easing: string;
}

export interface TankDesignTheme {
  id: string;
  name: string;
  description: string;
  previewColor: string;
  statusBarHex: string;
  fonts: TankThemeFonts;
  colors: TankThemeColors;
  textures: TankThemeTextures;
  borders: TankThemeBorders;
  spacing: TankThemeSpacing;
  animations: TankThemeAnimations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset Definitions
// ─────────────────────────────────────────────────────────────────────────────

export const TANK_ARCADE_BLUE_THEME: TankDesignTheme = {
  id: "tank-arcade-blue",
  name: "Arcade Blue",
  description: "Official Tank Arcade Slate Blue theme with crafted asphalt background & iOS status bar (#557194).",
  previewColor: "#557194",
  statusBarHex: "#557194",
  fonts: {
    primary: "Tank Highway Gothic, Plus Jakarta Sans, sans-serif",
    secondary: "Tank 5x5 Dots, JetBrains Mono, monospace",
    display: "Tank Alarm Clock, monospace",
    stamp: "Tank Army Rust, sans-serif",
  },
  colors: {
    primary: "#6c8db5",
    secondary: "#466080",
    tertiary: "#3b516c",
    light: "#f3f4f6",
    dark: "#111827",
    background: "#557194",
    link: "#38bdf8",
    danger: "#ef4444",
    lightText: "#f9fafb",
    darkText: "#241f14",
  },
  textures: {
    background: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-light.png",
    panel: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/light-aluminum.png",
    innerPanel: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/ice-age.png",
    darkPanel: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-dark.png",
    metal: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/metal.png",
  },
  borders: {
    radius: "0.5rem",
    width: "3px",
    style: "outset",
    bevel: "industrial",
  },
  spacing: {
    base: "1rem",
    panelPadding: "1rem",
    gap: "0.75rem",
  },
  animations: {
    enabled: true,
    duration: "150ms",
    glow: "0 0 10px rgba(108, 141, 181, 0.6)",
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
};

export const TANK_ARCADE_GREEN_THEME: TankDesignTheme = {
  id: "tank-arcade-green",
  name: "OG Green",
  description: "Classic Tank console theme with vintage army sage green background (#637F6D).",
  previewColor: "#637F6D",
  statusBarHex: "#637F6D",
  fonts: {
    primary: "Tank Highway Gothic, Plus Jakarta Sans, sans-serif",
    secondary: "Tank 5x5 Dots, JetBrains Mono, monospace",
    display: "Tank Alarm Clock, monospace",
    stamp: "Tank Army Rust, sans-serif",
  },
  colors: {
    primary: "#789687",
    secondary: "#718F7F",
    tertiary: "#708E7F",
    light: "#f3f4f6",
    dark: "#141a16",
    background: "#637F6D",
    link: "#34d399",
    danger: "#ff2200",
    lightText: "#ffffff",
    darkText: "#1a201b",
  },
  textures: {
    background: "https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/green-bg.png",
    panel: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/otis-redding.png",
    innerPanel: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/ice-age.png",
    darkPanel: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-dark.png",
    metal: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/metal.png",
  },
  borders: {
    radius: "0.5rem",
    width: "3px",
    style: "outset",
    bevel: "industrial",
  },
  spacing: {
    base: "1rem",
    panelPadding: "1rem",
    gap: "0.75rem",
  },
  animations: {
    enabled: true,
    duration: "150ms",
    glow: "0 0 10px rgba(120, 150, 135, 0.6)",
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
};

/**
 * Stable hardware skin for the Tank interface.
 *
 * Background presets are wallpaper choices, not complete UI themes. Keeping
 * the chrome on its own neutral base prevents OG Green / Arcade Blue from
 * tinting every panel while still allowing the settings overrides below to
 * customize chassis colors, textures, borders, spacing, and motion.
 */
export const TANK_NEUTRAL_CHROME_THEME: TankDesignTheme = {
  ...TANK_ARCADE_BLUE_THEME,
  id: "tank-neutral-chrome",
  name: "Tank Neutral Chrome",
  description: "Neutral brushed-metal UI chrome, independent of the selected Tank background.",
  colors: {
    ...TANK_ARCADE_BLUE_THEME.colors,
    primary: "#858b92",
    secondary: "#6e737b",
    tertiary: "#92979d",
  },
  animations: {
    ...TANK_ARCADE_BLUE_THEME.animations,
    glow: "0 0 10px rgba(133, 139, 146, 0.55)",
  },
};

export const TANK_HEAVY_INDUSTRIAL_THEME: TankDesignTheme = {
  id: "tank-heavy-industrial",
  name: "Heavy Industrial (Obsidian Steel)",
  description: "High-durability forged plate aesthetic with safety amber highlights and brushed steel.",
  previewColor: "#242830",
  statusBarHex: "#242830",
  fonts: {
    primary: "Tank Highway Gothic, Plus Jakarta Sans, sans-serif",
    secondary: "JetBrains Mono, monospace",
    display: "Tank Alarm Clock, monospace",
    stamp: "Tank Army Rust, sans-serif",
  },
  colors: {
    primary: "#f59e0b",
    secondary: "#374151",
    tertiary: "#4b5563",
    light: "#f3f4f6",
    dark: "#111827",
    background: "#242830",
    link: "#fbbf24",
    danger: "#ef4444",
    lightText: "#f3f4f6",
    darkText: "#111827",
  },
  textures: {
    background: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/metal.png",
    panel: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/light-aluminum.png",
    innerPanel: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/concrete-wall.png",
    darkPanel: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-dark.png",
    metal: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/metal.png",
  },
  borders: {
    radius: "0.25rem",
    width: "2px",
    style: "solid",
    bevel: "heavy",
  },
  spacing: {
    base: "1rem",
    panelPadding: "1rem",
    gap: "0.75rem",
  },
  animations: {
    enabled: true,
    duration: "120ms",
    glow: "0 0 12px rgba(245, 158, 11, 0.6)",
    easing: "cubic-bezier(0.2, 0, 0, 1)",
  },
};

export const TANK_RETRO_CYBER_THEME: TankDesignTheme = {
  id: "tank-retro-cyber",
  name: "Retro Cyber CRT",
  description: "Phosphor green terminal CRT vibes with high-contrast nocturnal surveillance tones.",
  previewColor: "#0f172a",
  statusBarHex: "#0f172a",
  fonts: {
    primary: "Tank Highway Gothic Wide, Plus Jakarta Sans, sans-serif",
    secondary: "Tank 5x5 Dots, JetBrains Mono, monospace",
    display: "Tank Alarm Clock, monospace",
    stamp: "Tank Army Rust, sans-serif",
  },
  colors: {
    primary: "#10b981",
    secondary: "#064e3b",
    tertiary: "#047857",
    light: "#ecfdf5",
    dark: "#022c22",
    background: "#0f172a",
    link: "#34d399",
    danger: "#f43f5e",
    lightText: "#ecfdf5",
    darkText: "#022c22",
  },
  textures: {
    background: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-dark.png",
    panel: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/ice-age.png",
    innerPanel: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/notebook.png",
    darkPanel: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-dark.png",
    metal: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/light-aluminum.png",
  },
  borders: {
    radius: "0.75rem",
    width: "2px",
    style: "groove",
    bevel: "subtle",
  },
  spacing: {
    base: "1rem",
    panelPadding: "1.25rem",
    gap: "0.75rem",
  },
  animations: {
    enabled: true,
    duration: "180ms",
    glow: "0 0 14px rgba(16, 185, 129, 0.7)",
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
};

export const TANK_DESIGN_THEMES: TankDesignTheme[] = [
  TANK_ARCADE_BLUE_THEME,
  TANK_ARCADE_GREEN_THEME,
  TANK_HEAVY_INDUSTRIAL_THEME,
  TANK_RETRO_CYBER_THEME,
];

export function getTankDesignTheme(id?: string): TankDesignTheme {
  if (!id) return TANK_ARCADE_BLUE_THEME;
  const found = TANK_DESIGN_THEMES.find((t) => t.id === id);
  if (found) return found;
  if (id === "tank-arcade-green") return TANK_ARCADE_GREEN_THEME;
  if (id === "tank-arcade-blue") return TANK_ARCADE_BLUE_THEME;
  return TANK_ARCADE_BLUE_THEME;
}

export const TANK_TEXTURE_PATTERNS = [
  { id: "none", label: "None", url: null },
  { id: "asphalt-light", label: "Asphalt Light", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-light.png" },
  { id: "asphalt-dark", label: "Asphalt Dark", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-dark.png" },
  { id: "otis-redding", label: "Otis Redding", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/otis-redding.png" },
  { id: "cardboard", label: "Cardboard", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/cardboard.png" },
  { id: "light-aluminum", label: "Light Aluminum", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/light-aluminum.png" },
  { id: "metal", label: "Heavy Metal", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/metal.png" },
  { id: "ice-age", label: "Ice Age", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/ice-age.png" },
  { id: "concrete", label: "Concrete", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/concrete-wall.png" },
  { id: "notebook", label: "Notebook", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/notebook.png" },
  { id: "old-husks", label: "Old Husks", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/old-husks.png" },
  { id: "wood", label: "Wood", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/dark-wood.png" },
  { id: "tire", label: "Tire", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/dark-tire.png" },
  { id: "leather", label: "Leather", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/leather.png" },
  { id: "brick", label: "Brick", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/brick-wall-dark.png" },
  { id: "snow", label: "Snow", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/snow.png" },
] as const;

export type TankTexturePattern = (typeof TANK_TEXTURE_PATTERNS)[number];

export type TankThemeCustomOverrides = {
  fonts?: Partial<TankThemeFonts>;
  colors?: Partial<TankThemeColors>;
  textures?: Partial<TankThemeTextures>;
  borders?: Partial<TankThemeBorders>;
  spacing?: Partial<TankThemeSpacing>;
  animations?: Partial<TankThemeAnimations>;
  statusBarHex?: string;
};

export function resolveTankTheme(
  baseThemeIdOrTheme?: string | TankDesignTheme,
  overrides?: Partial<TankDesignTheme> | TankThemeCustomOverrides,
): TankDesignTheme {
  const base =
    typeof baseThemeIdOrTheme === "string"
      ? getTankDesignTheme(baseThemeIdOrTheme)
      : baseThemeIdOrTheme ?? TANK_ARCADE_BLUE_THEME;

  if (!overrides) return base;

  return {
    ...base,
    ...overrides,
    statusBarHex: overrides.statusBarHex ?? overrides.colors?.background ?? base.statusBarHex,
    fonts: {
      ...base.fonts,
      ...(overrides.fonts || {}),
    },
    colors: {
      ...base.colors,
      ...(overrides.colors || {}),
    },
    textures: {
      ...base.textures,
      ...(overrides.textures || {}),
    },
    borders: {
      ...base.borders,
      ...(overrides.borders || {}),
    },
    spacing: {
      ...base.spacing,
      ...(overrides.spacing || {}),
    },
    animations: {
      ...base.animations,
      ...(overrides.animations || {}),
    },
  };
}

export function formatTextureUrl(urlOrPath?: string | null): string {
  if (!urlOrPath || urlOrPath === "none") return "none";
  if (urlOrPath.startsWith("url(") || urlOrPath.startsWith("linear-gradient(")) {
    return urlOrPath;
  }
  return `url("${urlOrPath}")`;
}

export function buildTankThemeCssVariables(theme: TankDesignTheme): Record<string, string> {
  return {
    // 1. Fonts
    "--tank-font-primary": theme.fonts.primary,
    "--tank-font-secondary": theme.fonts.secondary,
    ...(theme.fonts.display ? { "--tank-font-display": theme.fonts.display } : {}),
    ...(theme.fonts.stamp ? { "--tank-font-stamp": theme.fonts.stamp } : {}),

    // 2. Colors
    "--tank-color-primary": theme.colors.primary,
    "--tank-color-secondary": theme.colors.secondary,
    "--tank-color-tertiary": theme.colors.tertiary,
    "--tank-color-light": theme.colors.light,
    "--tank-color-dark": theme.colors.dark,
    "--tank-color-background": theme.colors.background,
    "--tank-color-link": theme.colors.link,
    "--tank-color-danger": theme.colors.danger,
    "--tank-color-text-light": theme.colors.lightText,
    "--tank-color-text-dark": theme.colors.darkText,

    // 3. Textures
    "--tank-texture-background": formatTextureUrl(theme.textures.background),
    "--tank-texture-panel": formatTextureUrl(theme.textures.panel),
    "--tank-texture-inner-panel": formatTextureUrl(theme.textures.innerPanel),
    "--tank-texture-dark-panel": formatTextureUrl(theme.textures.darkPanel),
    "--tank-texture-metal": formatTextureUrl(theme.textures.metal),

    // Backward-compatible panel texture
    "--tank-panel-texture": formatTextureUrl(theme.textures.panel),

    // 4. Borders
    "--tank-border-radius": theme.borders.radius,
    "--tank-border-width": theme.borders.width,
    "--tank-border-style": theme.borders.style,

    // 5. Spacing
    "--tank-spacing-base": theme.spacing.base,
    "--tank-panel-padding": theme.spacing.panelPadding,
    "--tank-module-gap": theme.spacing.gap,

    // 6. Animations
    "--tank-anim-duration": theme.animations.enabled ? theme.animations.duration : "0ms",
    "--tank-anim-glow": theme.animations.enabled ? theme.animations.glow : "none",
    "--tank-anim-easing": theme.animations.easing,

    // Status bar & system base background sync
    "--lt-status-bar": theme.statusBarHex,
    "--lt-bg": theme.statusBarHex,
    "--background": theme.statusBarHex,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward Compatibility: Tank Background Themes & Status Bar Registry
// ─────────────────────────────────────────────────────────────────────────────

export type TankBackgroundTheme = {
  id: string;
  label: string;
  themeId: string; // connects to unenter.live theme system id (e.g. 'tank-green')
  backgroundUrl: string;
  statusBarHex: string;
  palette: {
    base: string;
    highlight: string;
    midtone: string;
    border: string;
  };
};

export const TANK_BACKGROUND_THEMES: TankBackgroundTheme[] = [
  {
    id: "tank-arcade-green",
    label: "OG Green",
    themeId: "tank-green",
    backgroundUrl: TANK_ARCADE_GREEN_THEME.textures.background,
    statusBarHex: TANK_ARCADE_GREEN_THEME.statusBarHex,
    palette: {
      base: TANK_ARCADE_GREEN_THEME.colors.background,
      highlight: TANK_ARCADE_GREEN_THEME.colors.primary,
      midtone: TANK_ARCADE_GREEN_THEME.colors.secondary,
      border: TANK_ARCADE_GREEN_THEME.colors.tertiary,
    },
  },
  {
    id: "tank-arcade-blue",
    label: "Arcade Blue",
    themeId: "tank-blue",
    backgroundUrl: TANK_ARCADE_BLUE_THEME.textures.background,
    statusBarHex: TANK_ARCADE_BLUE_THEME.statusBarHex,
    palette: {
      base: TANK_ARCADE_BLUE_THEME.colors.background,
      highlight: TANK_ARCADE_BLUE_THEME.colors.primary,
      midtone: TANK_ARCADE_BLUE_THEME.colors.secondary,
      border: TANK_ARCADE_BLUE_THEME.colors.tertiary,
    },
  },
];

export function getTankBackgroundTheme(id?: string): TankBackgroundTheme {
  const found = TANK_BACKGROUND_THEMES.find((t) => t.id === id);
  return (
    found ||
    TANK_BACKGROUND_THEMES.find((theme) => theme.id === "tank-arcade-blue")!
  );
}

export function resolveTankChromeTheme(
  overrides?: Partial<TankDesignTheme> | TankThemeCustomOverrides,
): TankDesignTheme {
  return resolveTankTheme(TANK_NEUTRAL_CHROME_THEME, overrides);
}

function rem(value: number): string {
  return `${Math.round(value * 1000) / 1000}rem`;
}

export function buildTankSpacingScale(value: number): TankThemeSpacing {
  const base = Number.isFinite(value) ? Math.min(2, Math.max(0.25, value)) : 1;
  return {
    base: rem(base),
    panelPadding: rem(Math.min(2.5, Math.max(0.5, base * 1.35))),
    gap: rem(Math.min(1.5, Math.max(0.25, base * 0.85))),
  };
}

// Swap this to re-skin the whole zone once a second theme pack exists.
export const ACTIVE_THEME: TankTheme = TANK_ARCADE_THEME;
