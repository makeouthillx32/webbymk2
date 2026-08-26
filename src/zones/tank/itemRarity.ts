// One rarity palette, shared by every surface that shows an item.
//
// Plain module, no "use server" and no client directive: the chat renderer, the
// inventory, the store and the server-side item definitions all need the same
// answer, and a second copy of these colours would drift the moment someone
// tweaks one of them.

export type ItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";

export type RarityPresentation = {
  label: string;
  /** Colour of the action text in a console card. */
  text: string;
  /** Border of the card. */
  border: string;
  /** Card background. Kept dark so white body text stays readable. */
  background: string;
  /** Optional glow — only the top tiers get one, so it still means something. */
  glow: string;
  /** Solid colour for a rarity pill/badge. */
  badge: string;
};

/**
 * Deliberately escalating: the first three tiers are flat, and only epic and
 * above get a glow. If everything glows, nothing reads as rare.
 */
export const RARITY_PRESENTATION: Record<ItemRarity, RarityPresentation> = {
  common: {
    label: "Common",
    text: "text-slate-200",
    border: "border-slate-600/60",
    background: "bg-[#161a23]/95",
    glow: "",
    badge: "bg-slate-500 text-white",
  },
  uncommon: {
    label: "Uncommon",
    text: "text-emerald-300",
    border: "border-emerald-500/50",
    background: "bg-emerald-950/40",
    glow: "",
    badge: "bg-emerald-500 text-black",
  },
  rare: {
    label: "Rare",
    text: "text-sky-300",
    border: "border-sky-500/50",
    background: "bg-sky-950/40",
    glow: "",
    badge: "bg-sky-500 text-black",
  },
  epic: {
    label: "Epic",
    text: "text-fuchsia-300",
    border: "border-fuchsia-500/60",
    background: "bg-fuchsia-950/40",
    glow: "shadow-[0_0_14px_rgba(217,70,239,0.25)]",
    badge: "bg-fuchsia-500 text-white",
  },
  legendary: {
    label: "Legendary",
    text: "text-amber-300",
    border: "border-amber-400/70",
    background: "bg-amber-950/40",
    glow: "shadow-[0_0_18px_rgba(251,191,36,0.30)]",
    badge: "bg-amber-400 text-black",
  },
  mythic: {
    label: "Mythic",
    text: "text-rose-300",
    border: "border-rose-500/70",
    background: "bg-rose-950/45",
    glow: "shadow-[0_0_22px_rgba(244,63,94,0.35)]",
    badge: "bg-rose-500 text-white",
  },
};

/**
 * Falls back to `common` rather than throwing or rendering an unstyled card.
 * Rarity arrives from the database and from item definitions in code, and an
 * item whose rarity nobody set should still be readable.
 */
export function getRarityPresentation(rarity?: string | null): RarityPresentation {
  const key = (rarity ?? "").toLowerCase() as ItemRarity;
  return RARITY_PRESENTATION[key] ?? RARITY_PRESENTATION.common;
}

export function isItemRarity(value?: string | null): value is ItemRarity {
  return !!value && value.toLowerCase() in RARITY_PRESENTATION;
}
