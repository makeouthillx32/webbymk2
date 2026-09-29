// src/zones/tank/obs/overlaySkin.ts
// ─────────────────────────────────────────────────────────────────────────────
// The Tank look, for overlays.
//
// The independent browser sources were built for correctness first and ended up
// wearing whatever Tailwind gave them — `font-mono`, `font-black`, a translucent
// black box. They read as generic streaming widgets rather than as part of the
// Tank console, which uses real fonts (Highway Gothic, Alarm Clock, 5x5 Dots)
// and real brushed-metal textures, both already hosted in Supabase Storage and
// already loaded on every overlay page by TankThemeStyles.
//
// This is the one place that turns a texture choice into CSS, so adding a skin
// is one entry here rather than an edit to four overlays.
//
// TWO RULES SHAPE EVERY VALUE BELOW, and both come from this being composited
// onto a live broadcast:
//
//   1. A remote asset that fails to load must never leave the overlay
//      unreadable. Every texture carries a solid background colour underneath
//      it, and every font stack ends in a local generic — the fonts are fetched
//      from Supabase, and a browser source that cannot reach it must render
//      plain text, not invisible text.
//   2. Text sits over photographic metal, so it always carries a shadow. Dark
//      text on a bright aluminium highlight is otherwise illegible in exactly
//      the places the texture looks best.
// ─────────────────────────────────────────────────────────────────────────────

import { ACTIVE_THEME } from "../theme";

export type OverlayTextureId = "clean" | "aluminum" | "metal" | "plate";

export const OVERLAY_TEXTURES: readonly {
  id: OverlayTextureId;
  label: string;
  hint: string;
}[] = [
  {
    id: "clean",
    label: "Clean (no texture)",
    hint: "Translucent black. Highest contrast over any camera, and the safest default.",
  },
  { id: "aluminum", label: "Brushed aluminium", hint: "Light console panel. Dark text." },
  { id: "metal", label: "Dark metal", hint: "Heavier plate. Light text." },
  {
    id: "plate",
    label: "Riveted plate",
    hint: "Dark metal with console screws in the corners. The full Tank console look.",
  },
];

export function isOverlayTexture(value: unknown): value is OverlayTextureId {
  return OVERLAY_TEXTURES.some((texture) => texture.id === value);
}

/**
 * Font stacks for overlay text.
 *
 * Each ends in a real generic. TankThemeStyles injects the @font-face rules on
 * mount, so there is a window before the remote file arrives — and on a failed
 * fetch that window never closes. Falling back to a monospace or condensed
 * sans keeps the layout close instead of collapsing it.
 */
export const TANK_OVERLAY_FONTS = {
  /** Room names, badges, button-style labels. */
  label: `"${ACTIVE_THEME.fonts.label}", "Arial Narrow", sans-serif`,
  /** Wider variant, for headings that need presence. */
  labelWide: `"${ACTIVE_THEME.fonts.labelWide}", "Arial Narrow", sans-serif`,
  /** Glowing LED readouts — timecode, counters. */
  display: `"${ACTIVE_THEME.fonts.display}", "DS-Digital", monospace`,
  /** Small pixel readouts — dB values, percentages. */
  dotMatrix: `"${ACTIVE_THEME.fonts.dotMatrix}", "Courier New", monospace`,
  /** Stencil accent, for stamps and warnings. */
  stamp: `"${ACTIVE_THEME.fonts.stamp}", "Impact", sans-serif`,
} as const;

export type OverlaySkin = {
  texture: OverlayTextureId;
  /** Panel chrome — drop straight onto a container's `style`. */
  panel: Record<string, string>;
  /** Primary text colour for this skin. */
  ink: string;
  /** Secondary/label text colour. */
  inkMuted: string;
  /** Shadow that keeps text readable over photographic metal. */
  textShadow: string;
  /**
   * Tank orange, adjusted for the skin underneath.
   *
   * The overlays used to hardcode yellow-400 and emerald-400 accents, which are
   * fine on translucent black and unreadable on brushed aluminium — precisely
   * where the texture looks best. One accent per skin, chosen against it.
   */
  accent: string;
  /** Live/recording indicator. Red on every skin; only the tone moves. */
  live: string;
  /** True when the skin is light, so callers can flip accent choices. */
  isLight: boolean;
};

const SCREW_SIZE = "13px";

/**
 * Corner screws, expressed as four extra background layers.
 *
 * Done in CSS rather than as four <img> elements on purpose: an overlay is a
 * fixed, pointer-events-none layer, and four absolutely-positioned children per
 * panel is four more things to keep aligned when a panel resizes. Background
 * layers move with the box for free.
 */
function screwLayers(): { image: string; position: string; size: string; repeat: string } {
  const { screwTopLeft, screwTopRight, screwBottomLeft, screwBottomRight } = ACTIVE_THEME.images;
  return {
    image: [
      `url("${screwTopLeft}")`,
      `url("${screwTopRight}")`,
      `url("${screwBottomLeft}")`,
      `url("${screwBottomRight}")`,
      `url("${ACTIVE_THEME.images.metalTexture}")`,
    ].join(", "),
    position: "top 5px left 5px, top 5px right 5px, bottom 5px left 5px, bottom 5px right 5px, center",
    size: `${SCREW_SIZE}, ${SCREW_SIZE}, ${SCREW_SIZE}, ${SCREW_SIZE}, cover`,
    repeat: "no-repeat, no-repeat, no-repeat, no-repeat, repeat",
  };
}

export function resolveOverlaySkin(textureInput: unknown): OverlaySkin {
  const texture: OverlayTextureId = isOverlayTexture(textureInput) ? textureInput : "clean";

  if (texture === "aluminum") {
    return {
      texture,
      panel: {
        // The colour is not decoration: if Supabase is unreachable the image
        // never paints and this is the whole panel.
        backgroundColor: "#b9bcbe",
        backgroundImage: `url("${ACTIVE_THEME.images.aluminumTexture}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        border: "1px solid rgba(0,0,0,0.45)",
        borderRadius: "4px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65), 0 3px 10px rgba(0,0,0,0.55)",
      },
      ink: "#14181a",
      inkMuted: "#3d4548",
      textShadow: "0 1px 0 rgba(255,255,255,0.45)",
      // Darkened: #ff4d00 on a bright panel is the same contrast problem as
      // the yellow it replaces.
      accent: "#bf3a00",
      live: "#c21807",
      isLight: true,
    };
  }

  if (texture === "metal" || texture === "plate") {
    const screws = texture === "plate" ? screwLayers() : null;
    return {
      texture,
      panel: {
        backgroundColor: "#2b2f33",
        backgroundImage: screws ? screws.image : `url("${ACTIVE_THEME.images.metalTexture}")`,
        backgroundSize: screws ? screws.size : "cover",
        backgroundPosition: screws ? screws.position : "center",
        backgroundRepeat: screws ? screws.repeat : "repeat",
        border: "1px solid rgba(0,0,0,0.7)",
        borderRadius: "4px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 3px 12px rgba(0,0,0,0.6)",
        // Screws need room; without it they sit under the text.
        ...(screws ? { padding: "12px 20px" } : {}),
      },
      ink: "#f2f4f5",
      inkMuted: "#a9b2b7",
      textShadow: "0 1px 2px rgba(0,0,0,0.85)",
      accent: "#ff6a1f",
      live: "#ff3b30",
      isLight: false,
    };
  }

  return {
    texture: "clean",
    panel: {
      backgroundColor: "rgba(0,0,0,0.85)",
      border: "1px solid rgba(255,255,255,0.2)",
      borderRadius: "4px",
      boxShadow: "0 3px 12px rgba(0,0,0,0.5)",
      backdropFilter: "blur(6px)",
    },
    ink: "#ffffff",
    inkMuted: "#94a3b8",
    textShadow: "0 1px 2px rgba(0,0,0,0.9)",
    accent: "#ff4d00",
    live: "#ff2d20",
    isLight: false,
  };
}
