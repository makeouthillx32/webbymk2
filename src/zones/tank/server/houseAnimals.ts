// src/zones/tank/server/houseAnimals.ts
// ─────────────────────────────────────────────────────────────────────────────
// Enrolled House Animals & Pets Catalog
//
// Defines the 4 official house pets (2 dogs, 2 cats) with full profile metadata,
// personality traits, favorites, detector labels, and interactive pat counters.
// ─────────────────────────────────────────────────────────────────────────────

export type HouseAnimalSpecies = "dog" | "cat";

export type HouseAnimal = {
  id: string;
  displayName: string;
  species: HouseAnimalSpecies;
  breed: string;
  role: string;
  detectorLabel: string;
  icon: string;
  avatarUrl: string;
  age: string;
  favoriteRoom: string;
  favoriteSnack: string;
  favoriteToy: string;
  personality: string[];
  bio: string;
  patsCount: number;
  badge: string;
};

export const DEFAULT_HOUSE_ANIMALS: HouseAnimal[] = [
  {
    id: "pet_buster",
    displayName: "Buster",
    species: "dog",
    breed: "Golden Retriever",
    role: "House Mascot & Head of Security",
    detectorLabel: "dog",
    icon: "🐕",
    avatarUrl: "/images/tank-items/dog-bone.png",
    age: "3 Years",
    favoriteRoom: "living-room",
    favoriteSnack: "Bacon Strips",
    favoriteToy: "Squeaky Tennis Ball",
    personality: ["Loyal", "Goofy", "Always Hungry", "Loves Belly Rubs"],
    bio: "The golden-hearted defender of the living room sofa. Buster will warmly greet every guest and alert the chat when parcels arrive.",
    patsCount: 1420,
    badge: "ALPHA MASCOT",
  },
  {
    id: "pet_kona",
    displayName: "Kona",
    species: "dog",
    breed: "French Bulldog",
    role: "Chief Nap Officer & Zoomies Specialist",
    detectorLabel: "dog",
    icon: "🐶",
    avatarUrl: "/images/tank-items/boxing-gloves.png",
    age: "2 Years",
    favoriteRoom: "game-room",
    favoriteSnack: "Peanut Butter Treats",
    favoriteToy: "Rope Tug",
    personality: ["Stubborn", "Couch Potato", "Snort Machine", "High Energy Zoomies"],
    bio: "Known for legendary 2 AM zoomies around the gaming tables. Sleeps 18 hours a day, demands treats the other 6.",
    patsCount: 980,
    badge: "ZOOMIES PRO",
  },
  {
    id: "pet_mochi",
    displayName: "Mochi",
    species: "cat",
    breed: "Calico",
    role: "Kitchen Inspector & Sunbeam Connoisseur",
    detectorLabel: "cat",
    icon: "🐱",
    avatarUrl: "/images/tank-items/royal-jelly.png",
    age: "4 Years",
    favoriteRoom: "kitchen",
    favoriteSnack: "Tuna Flakes",
    favoriteToy: "Cardboard Box",
    personality: ["Curious", "Vocal", "Purr Engine", "Gravity Tester"],
    bio: "Inspects every meal prep in the kitchen from atop the refrigerator. Master of pushing stray cups off high counters.",
    patsCount: 2310,
    badge: "KITCHEN BOSS",
  },
  {
    id: "pet_shadow",
    displayName: "Shadow",
    species: "cat",
    breed: "Black Shorthair",
    role: "Silent Night Stalker & Stealth Operator",
    detectorLabel: "cat",
    icon: "🐈‍⬛",
    avatarUrl: "/images/tank-items/lightsaber.png",
    age: "1 Year",
    favoriteRoom: "living-room",
    favoriteSnack: "Catnip Bites",
    favoriteToy: "Red Laser Dot",
    personality: ["Stealthy", "Mysterious", "Gentle", "Laser Chaser"],
    bio: "Melts into the shadows and appears instantly whenever the cat-laser item is deployed in the live chat.",
    patsCount: 1750,
    badge: "STEALTH CAT",
  },
];

/**
 * Matches a detected label or name against enrolled house animals
 */
export function matchEnrolledAnimal(labelOrName?: string | null): HouseAnimal | null {
  if (!labelOrName) return null;
  const lower = labelOrName.toLowerCase().trim();
  return (
    DEFAULT_HOUSE_ANIMALS.find(
      (a) =>
        a.id.toLowerCase() === lower ||
        a.displayName.toLowerCase() === lower ||
        a.detectorLabel.toLowerCase() === lower
    ) || null
  );
}

export function getPetsBySpecies(species: HouseAnimalSpecies): HouseAnimal[] {
  return DEFAULT_HOUSE_ANIMALS.filter((p) => p.species === species);
}
