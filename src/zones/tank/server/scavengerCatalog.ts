// src/zones/tank/server/scavengerCatalog.ts
// ─────────────────────────────────────────────────────────────────────────────
// Scavenger Item Catalog & YOLO COCO 80 Mapping
//
// Maps everyday objects detected by YOLOv8/v11 into scavenger hunt targets
// with rarity tiers, token rewards, XP bounties, and category metadata.
// ─────────────────────────────────────────────────────────────────────────────

export type ScavengerRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type ScavengerCategory =
  | "tableware"
  | "electronics"
  | "apparel"
  | "furniture"
  | "easter_egg"
  | "clutter";

export type ScavengerItemDefinition = {
  classLabel: string; // YOLO class name (e.g. "cup", "bottle", "backpack", "waldo")
  displayName: string;
  category: ScavengerCategory;
  rarity: ScavengerRarity;
  icon: string;
  rewardTokens: number;
  rewardXp: number;
  hintDescription: string;
};

export const SCAVENGER_ITEM_CATALOG: Record<string, ScavengerItemDefinition> = {
  // ── Tableware & Beverages (Common) ──
  cup: {
    classLabel: "cup",
    displayName: "Coffee Mug",
    category: "tableware",
    rarity: "common",
    icon: "☕",
    rewardTokens: 15,
    rewardXp: 25,
    hintDescription: "A ceramic coffee mug or tumbler sitting on a table or counter.",
  },
  bottle: {
    classLabel: "bottle",
    displayName: "Water Bottle",
    category: "tableware",
    rarity: "common",
    icon: "🍾",
    rewardTokens: 15,
    rewardXp: 25,
    hintDescription: "A reusable flask or beverage bottle resting in the room.",
  },
  "wine glass": {
    classLabel: "wine glass",
    displayName: "Glassware",
    category: "tableware",
    rarity: "common",
    icon: "🍷",
    rewardTokens: 20,
    rewardXp: 30,
    hintDescription: "A glass tumbler or wine glass sitting in the kitchen or lounge.",
  },
  bowl: {
    classLabel: "bowl",
    displayName: "Snack Bowl",
    category: "tableware",
    rarity: "common",
    icon: "🥣",
    rewardTokens: 15,
    rewardXp: 25,
    hintDescription: "A cereal or snack bowl on a flat surface.",
  },

  // ── Electronics & Office (Uncommon) ──
  laptop: {
    classLabel: "laptop",
    displayName: "Laptop Computer",
    category: "electronics",
    rarity: "uncommon",
    icon: "💻",
    rewardTokens: 35,
    rewardXp: 50,
    hintDescription: "A laptop computer open or closed on a desk or couch.",
  },
  "cell phone": {
    classLabel: "cell phone",
    displayName: "Smartphone",
    category: "electronics",
    rarity: "uncommon",
    icon: "📱",
    rewardTokens: 40,
    rewardXp: 55,
    hintDescription: "A smartphone lying flat or standing on a table.",
  },
  keyboard: {
    classLabel: "keyboard",
    displayName: "Computer Keyboard",
    category: "electronics",
    rarity: "uncommon",
    icon: "⌨️",
    rewardTokens: 30,
    rewardXp: 45,
    hintDescription: "A keyboard hooked up in the gaming or control room.",
  },
  mouse: {
    classLabel: "mouse",
    displayName: "Gaming Mouse",
    category: "electronics",
    rarity: "uncommon",
    icon: "🖱️",
    rewardTokens: 25,
    rewardXp: 40,
    hintDescription: "A computer mouse resting on a mousepad or desk.",
  },
  book: {
    classLabel: "book",
    displayName: "Book / Journal",
    category: "clutter",
    rarity: "uncommon",
    icon: "📖",
    rewardTokens: 25,
    rewardXp: 35,
    hintDescription: "A book, notebook, or manual resting in the house.",
  },
  remote: {
    classLabel: "remote",
    displayName: "TV Remote",
    category: "electronics",
    rarity: "uncommon",
    icon: "📺",
    rewardTokens: 30,
    rewardXp: 45,
    hintDescription: "A media remote sitting on the coffee table or sofa.",
  },

  // ── Apparel & Accessories (Rare) ──
  backpack: {
    classLabel: "backpack",
    displayName: "Backpack / Rucksack",
    category: "apparel",
    rarity: "rare",
    icon: "🎒",
    rewardTokens: 60,
    rewardXp: 90,
    hintDescription: "A gear backpack slung over a chair or resting on the floor.",
  },
  handbag: {
    classLabel: "handbag",
    displayName: "Tote Bag",
    category: "apparel",
    rarity: "rare",
    icon: "👜",
    rewardTokens: 50,
    rewardXp: 80,
    hintDescription: "A shoulder tote or pouch sitting in the room.",
  },
  umbrella: {
    classLabel: "umbrella",
    displayName: "Umbrella",
    category: "apparel",
    rarity: "rare",
    icon: "☂️",
    rewardTokens: 65,
    rewardXp: 100,
    hintDescription: "An umbrella propped up in the entryway or corner.",
  },
  "sports ball": {
    classLabel: "sports ball",
    displayName: "Sports Ball",
    category: "clutter",
    rarity: "rare",
    icon: "⚽",
    rewardTokens: 55,
    rewardXp: 85,
    hintDescription: "A soccer, tennis, or basketball rolling in the room.",
  },
  skateboard: {
    classLabel: "skateboard",
    displayName: "Skateboard",
    category: "clutter",
    rarity: "rare",
    icon: "🛹",
    rewardTokens: 75,
    rewardXp: 110,
    hintDescription: "A skateboard resting against the wall.",
  },

  // ── Legendary / Special Easter Eggs (Legendary) ──
  waldo: {
    classLabel: "waldo",
    displayName: "Secret Waldo Marker",
    category: "easter_egg",
    rarity: "legendary",
    icon: "🕵️",
    rewardTokens: 150,
    rewardXp: 250,
    hintDescription: "A hidden striped Waldo marker placed somewhere in the house!",
  },
  pizza_box: {
    classLabel: "pizza_box",
    displayName: "Late Night Pizza Box",
    category: "clutter",
    rarity: "epic",
    icon: "🍕",
    rewardTokens: 100,
    rewardXp: 160,
    hintDescription: "A cardboard pizza box on the counter or gaming table.",
  },
};

/**
 * Resolves a YOLO detection label to a scavenger item definition.
 */
export function resolveScavengerItem(label?: string | null): ScavengerItemDefinition | null {
  if (!label) return null;
  const key = label.toLowerCase().trim();
  if (SCAVENGER_ITEM_CATALOG[key]) return SCAVENGER_ITEM_CATALOG[key];

  // Fuzzy match
  for (const [classKey, def] of Object.entries(SCAVENGER_ITEM_CATALOG)) {
    if (key.includes(classKey) || classKey.includes(key)) {
      return def;
    }
  }

  return null;
}
