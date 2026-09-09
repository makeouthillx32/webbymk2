// Universal Detection Target Catalog
// ─────────────────────────────────────────────────────────────────────────────
// SQL-like JSON registry of all detectable entities across Tank camera feeds:
// Housemembers (Tyler, Joe, Malia), Pets (Ghost, Milo), Trash/Hazards, and Props.
// ─────────────────────────────────────────────────────────────────────────────

export type DetectionCategory =
  | "house_member"
  | "pet_animal"
  | "trash_hazard"
  | "clutter_prop"
  | "toy_waldo"
  | "guest";

export type DetectionTargetRecord = {
  id: string;
  category: DetectionCategory;
  slug: string;
  displayName: string;
  yoloClassIds: string[];
  referenceImages: string[];
  confidenceThreshold: number;
  boxColor: string;
  badgeBg: string;
  pointValue: number;
  priority: "high" | "normal" | "low";
  metadata: Record<string, unknown>;
};

export const INITIAL_DETECTION_CATALOG: DetectionTargetRecord[] = [
  // ── HOUSEMEMBERS ──
  {
    id: "member_tyler",
    category: "house_member",
    slug: "tyler",
    displayName: "TYLER",
    yoloClassIds: ["person"],
    referenceImages: ["/images/tank-references/members/tyler_01.jpg"],
    confidenceThreshold: 0.82,
    boxColor: "#22c55e",
    badgeBg: "#15803d",
    pointValue: 100,
    priority: "high",
    metadata: { role: "Resident", clan: "Syndicate", primaryRoom: "game-room" },
  },
  {
    id: "member_joe",
    category: "house_member",
    slug: "joe",
    displayName: "JOE",
    yoloClassIds: ["person"],
    referenceImages: ["/images/tank-references/members/joe_01.jpg"],
    confidenceThreshold: 0.82,
    boxColor: "#22c55e",
    badgeBg: "#15803d",
    pointValue: 100,
    priority: "high",
    metadata: { role: "Resident", clan: "Raiders", primaryRoom: "game-room-2" },
  },
  {
    id: "member_malia",
    category: "house_member",
    slug: "malia",
    displayName: "MALIA",
    yoloClassIds: ["person"],
    referenceImages: ["/images/tank-references/members/malia_01.jpg"],
    confidenceThreshold: 0.82,
    boxColor: "#22c55e",
    badgeBg: "#15803d",
    pointValue: 100,
    priority: "high",
    metadata: { role: "Resident", clan: "Night Owls", primaryRoom: "living-room" },
  },

  // ── PETS & ANIMALS ──
  {
    id: "pet_foyer_dog",
    category: "pet_animal",
    slug: "dog_foyer",
    displayName: "WHITE DOG (FOYER)",
    yoloClassIds: ["dog"],
    referenceImages: ["/images/tank-references/pets/white_dog.jpg"],
    confidenceThreshold: 0.70,
    boxColor: "#06b6d4",
    badgeBg: "#0891b2",
    pointValue: 25,
    priority: "normal",
    metadata: { breed: "White Retriever Mix", knownHabitats: ["the-foyer", "living-room"] },
  },
  {
    id: "pet_living_cat",
    category: "pet_animal",
    slug: "cat_living",
    displayName: "ORANGE CAT (LIVING ROOM)",
    yoloClassIds: ["cat"],
    referenceImages: ["/images/tank-references/pets/orange_cat.jpg"],
    confidenceThreshold: 0.70,
    boxColor: "#f97316",
    badgeBg: "#ea580c",
    pointValue: 30,
    priority: "normal",
    metadata: { breed: "Orange Tabby", knownHabitats: ["living-room", "kitchen"] },
  },

  // ── TRASH & CLUTTER ──
  {
    id: "trash_fast_food_bag",
    category: "trash_hazard",
    slug: "food_bag",
    displayName: "TRASH: TAKE-OUT BAG",
    yoloClassIds: ["box", "bag", "trash"],
    referenceImages: [],
    confidenceThreshold: 0.55,
    boxColor: "#ef4444",
    badgeBg: "#b91c1c",
    pointValue: 50,
    priority: "high",
    metadata: { bountyTokens: 15, decayMinutes: 30, targetRoom: "kitchen" },
  },
  {
    id: "trash_drink_can",
    category: "trash_hazard",
    slug: "empty_can",
    displayName: "TRASH: BEVERAGE CAN",
    yoloClassIds: ["bottle", "cup", "can"],
    referenceImages: [],
    confidenceThreshold: 0.50,
    boxColor: "#ef4444",
    badgeBg: "#b91c1c",
    pointValue: 20,
    priority: "normal",
    metadata: { bountyTokens: 5, decayMinutes: 60 },
  },
  {
    id: "clutter_delivery_box",
    category: "clutter_prop",
    slug: "delivery_box",
    displayName: "CLUTTER: PACKAGE BOX",
    yoloClassIds: ["box"],
    referenceImages: [],
    confidenceThreshold: 0.60,
    boxColor: "#f59e0b",
    badgeBg: "#b45309",
    pointValue: 15,
    priority: "low",
    metadata: { movable: true },
  },

  // ── TOYS & EASTER EGGS ──
  {
    id: "toy_foot_detector",
    category: "toy_waldo",
    slug: "foot_detector",
    displayName: "GADGET: FOOT-DETECTOR 3000",
    yoloClassIds: ["toy", "gadget"],
    referenceImages: ["/images/tank-items/foot-detector.png"],
    confidenceThreshold: 0.75,
    boxColor: "#a855f7",
    badgeBg: "#7e22ce",
    pointValue: 200,
    priority: "high",
    metadata: { rarity: "legendary", flexPingMessage: "holds up the Foot-Detector 3000" },
  },
];

export function getDetectionCatalog(): DetectionTargetRecord[] {
  return INITIAL_DETECTION_CATALOG;
}

export function getTargetById(id: string): DetectionTargetRecord | undefined {
  return INITIAL_DETECTION_CATALOG.find((t) => t.id === id);
}

export function getTargetBySlug(slug: string): DetectionTargetRecord | undefined {
  return INITIAL_DETECTION_CATALOG.find((t) => t.slug === slug);
}

export function filterTargetsByCategory(category: DetectionCategory): DetectionTargetRecord[] {
  return INITIAL_DETECTION_CATALOG.filter((t) => t.category === category);
}
