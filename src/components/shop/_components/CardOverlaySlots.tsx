// src/components/shop/_components/CardOverlaySlots.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Five independently positioned text slots over a card image — ONE
// implementation, shared by the live storefront grid and the dashboard's
// section editor preview, for the same reason HeroSlideOverlay is shared: a
// preview that reimplements the layout starts lying the moment either side
// changes.
//
// Why slots instead of a stacked layout
// ────────────────────────────────────
// The previous overlay hardcoded "eyebrow + tagline in a top row, then
// name/subtitle/cta stacked at the bottom", with one position and one padding
// for the whole thing. That makes every card in every grid look the same. Each
// slot here carries its own anchor and offset, so a card can put the headline
// bottom-left, the kicker top-right, and the CTA anywhere at all.
//
// COPY lives on the taxonomy row (category/collection/tag). LAYOUT lives on the
// section, because the section is where the final render happens — one grid
// keeps a coherent look while every card supplies its own words.
//
// Why container-query units
// ─────────────────────────
// Offsets and type sizes are authored as pixels against a 400px reference card
// and emitted as `cqw`. A card is ~400px in a 3-up desktop grid but near
// full-width on a phone; fixed px would drift the whole composition between
// them, and the editor preview could only be honest at exactly one size. In
// cqw, "24px from the left" holds its proportion at any card size — which is
// also what lets the preview box render at any resolution and stay truthful.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";

/** Card width the editor's pixel numbers are quoted against. */
const REFERENCE_CARD_PX = 400;

/** px (at the reference width) → container-query width units. */
function cq(px: number): string {
  return `${((px / REFERENCE_CARD_PX) * 100).toFixed(4)}cqw`;
}

export type Anchor =
  | "top-left"    | "top-center"    | "top-right"
  | "mid-left"    | "mid-center"    | "mid-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export const ANCHORS: Anchor[] = [
  "top-left",    "top-center",    "top-right",
  "mid-left",    "mid-center",    "mid-right",
  "bottom-left", "bottom-center", "bottom-right",
];

export type SlotKey = "brand" | "kicker" | "headline" | "subtitle" | "cta";

export type SlotConfig = {
  /** Off hides the slot even when the card has copy for it. */
  on?: boolean;
  anchor?: Anchor;
  /** Horizontal offset from the anchored edge, px at a 400px card. */
  x?: number;
  /** Vertical offset from the anchored edge, px at a 400px card. */
  y?: number;
  /** Type size as a percentage of this slot's default. */
  size?: number;
  align?: "left" | "center" | "right";
};

/**
 * The five slots, in render order, each bound to the taxonomy column it draws
 * from. `field` is what the editor shows so it's obvious which text box on the
 * category feeds which box on the card.
 */
export const SLOTS: {
  key: SlotKey;
  label: string;
  field: string;
  /** Type size in px at the reference card width. */
  base: number;
  hint: string;
}[] = [
  { key: "brand",    label: "Brand mark", field: "eyebrow",   base: 11, hint: "Small wordmark, usually a corner." },
  { key: "kicker",   label: "Kicker",     field: "tagline",   base: 10, hint: "Short stacked line. Press Enter for a new line." },
  { key: "headline", label: "Headline",   field: "name",      base: 40, hint: "The category name itself." },
  { key: "subtitle", label: "Subtitle",   field: "subtitle",  base: 12, hint: "One supporting line under the headline." },
  { key: "cta",      label: "Call to action", field: "cta_label", base: 11, hint: "Gets an arrow automatically." },
];

/**
 * Defaults reproduce the reference layout: wordmark top-left, kicker top-right,
 * then headline / subtitle / CTA stacked up from the bottom-left. A grid that
 * has never been styled therefore already looks composed.
 */
export const SLOT_DEFAULTS: Record<SlotKey, Required<SlotConfig>> = {
  brand:    { on: true, anchor: "top-left",    x: 24, y: 24, size: 100, align: "left"  },
  kicker:   { on: true, anchor: "top-right",   x: 24, y: 24, size: 100, align: "right" },
  headline: { on: true, anchor: "bottom-left", x: 24, y: 96, size: 100, align: "left"  },
  subtitle: { on: true, anchor: "bottom-left", x: 24, y: 68, size: 100, align: "left"  },
  cta:      { on: true, anchor: "bottom-left", x: 24, y: 24, size: 100, align: "left"  },
};

export type CardOverlayStyle = {
  slots?: Partial<Record<SlotKey, SlotConfig>>;
  /** Theme token for the text. A card may override it per row. */
  colorToken?: string;
  underline?: boolean;
  /** Drop shadow behind the text. On by default — photos are unpredictable. */
  shadow?: boolean;
  scrimOpacity?: number;
  scrimStyle?: "flat" | "gradient";
};

/** The copy a card supplies. Every field optional — an empty slot renders nothing. */
export type CardCopy = {
  name?: string | null;
  eyebrow?: string | null;
  tagline?: string | null;
  subtitle?: string | null;
  cta_label?: string | null;
  /** Per-card colour override; beats the section's colourToken. */
  text_color_token?: string | null;
};

/**
 * Merge a slot's stored config over its default.
 *
 * Layout is a SECTION concern — it is set once in the Landing section editor
 * and applies to every card in the grid, so the cards stay coherent. There is
 * deliberately no per-card override here.
 */
export function resolveSlot(style: CardOverlayStyle | undefined, key: SlotKey): Required<SlotConfig> {
  return { ...SLOT_DEFAULTS[key], ...(style?.slots?.[key] ?? {}) };
}

/**
 * Anchor + offsets → absolute placement.
 *
 * Edge anchors offset inward from that edge. Centre anchors offset from the
 * midpoint, so their x/y may be negative.
 */
export function anchorStyle(anchor: Anchor, x: number, y: number): React.CSSProperties {
  const [v, h] = anchor.split("-") as ["top" | "mid" | "bottom", "left" | "center" | "right"];
  const s: React.CSSProperties = { position: "absolute" };
  const transforms: string[] = [];

  if (v === "top") s.top = cq(y);
  else if (v === "bottom") s.bottom = cq(y);
  else {
    s.top = `calc(50% + ${cq(y)})`;
    transforms.push("translateY(-50%)");
  }

  if (h === "left") s.left = cq(x);
  else if (h === "right") s.right = cq(x);
  else {
    s.left = `calc(50% + ${cq(x)})`;
    transforms.push("translateX(-50%)");
  }

  if (transforms.length) s.transform = transforms.join(" ");
  return s;
}

/** Per-slot typography. Sizes come from SLOTS.base and scale with `size`. */
const SLOT_TYPE: Record<SlotKey, React.CSSProperties> = {
  brand:    { fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.35em", lineHeight: 1.2 },
  kicker:   { fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.2em",  lineHeight: 1.7, whiteSpace: "pre-line" },
  headline: { fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.04 },
  subtitle: { fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.16em", lineHeight: 1.4 },
  cta:      { fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", lineHeight: 1.4 },
};

/**
 * Scrim behind the text. Two layers so hover darkening still works over a
 * configurable base — one element can't animate opacity past 1.
 */
export function CardScrim({ opacity, variant }: { opacity?: number; variant?: "flat" | "gradient" }) {
  const base = opacity ?? 0.25;
  if (base <= 0) return null;

  const paint =
    variant === "gradient"
      ? `linear-gradient(to top, rgba(0,0,0,${base}) 0%, rgba(0,0,0,${(base * 0.55).toFixed(3)}) 38%, rgba(0,0,0,0) 72%)`
      : `rgba(0,0,0,${base})`;

  return (
    <>
      <div className="pointer-events-none absolute inset-0" style={{ background: paint }} />
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `rgba(0,0,0,${Math.min(0.9, base + 0.1)})` }}
      />
    </>
  );
}

export function CardOverlaySlots({
  card,
  style,
}: {
  card: CardCopy;
  style?: CardOverlayStyle;
}) {
  // Per-card token beats the section default, so one card can carry dark type
  // over pale artwork without splitting the grid into two sections.
  const token = card.text_color_token || style?.colorToken || "";
  const color = token ? `hsl(var(--${token}))` : "#fff";
  const textShadow = style?.shadow === false ? undefined : "0 2px 10px rgba(0,0,0,0.55)";
  const underline = style?.underline === true;

  const copy: Record<SlotKey, string | null | undefined> = {
    brand: card.eyebrow,
    kicker: card.tagline,
    headline: card.name,
    subtitle: card.subtitle,
    cta: card.cta_label,
  };

  return (
    <div
      className="pointer-events-none absolute inset-0"
      // Establishes the container the cqw units resolve against — without it
      // every offset and type size would collapse to zero.
      style={{ containerType: "inline-size", color, textShadow }}
    >
      {SLOTS.map(({ key, base }) => {
        const cfg = resolveSlot(style, key);
        const value = copy[key];
        if (!cfg.on || !value) return null;

        const placement = anchorStyle(cfg.anchor, cfg.x, cfg.y);

        return (
          <div
            key={key}
            style={{
              ...placement,
              ...SLOT_TYPE[key],
              fontSize: cq((base * (cfg.size ?? 100)) / 100),
              textAlign: cfg.align,
              maxWidth: "84%",
              ...(key === "cta" && underline
                ? { textDecoration: "underline", textUnderlineOffset: "0.3em" }
                : {}),
            }}
          >
            {value}
            {key === "cta" && <span aria-hidden="true">{"  →"}</span>}
          </div>
        );
      })}
    </div>
  );
}
