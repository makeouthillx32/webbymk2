// The house pets. Mirrors houseMembers.ts's roster shape, scoped down: pets
// don't go through a confidence-gated identity classification (no "unknown
// pet" state exists, and none was asked for) — just a name attached to a
// detected dog/cat box, the same way a real detector would report a match.
//
// Same honesty as houseMembers.ts: nothing does real per-animal visual
// re-identification yet (that's a comparable build to face-matching people —
// a reference-image enrollment step plus a re-id model). Right now this
// roster only feeds the detection simulator, which is honest about being a
// simulator. Real YOLO decode still only knows "dog" / "cat" as a species,
// not which specific animal.

export type PetSpecies = "dog" | "cat";

export type PetMember = {
  id: string;
  /** Shown on the overlay, e.g. "MOLLY". */
  displayName: string;
  species: PetSpecies;
  breed?: string;
  /** Label the detector emits when it matches this pet's enrolment. */
  detectorLabel: string;
};

export const PET_ROSTER: PetMember[] = [
  { id: "pet_buster", displayName: "Buster", species: "dog", breed: "Golden Retriever", detectorLabel: "dog" },
  { id: "pet_kona", displayName: "Kona", species: "dog", breed: "French Bulldog", detectorLabel: "dog" },
  { id: "pet_mochi", displayName: "Mochi", species: "cat", breed: "Calico", detectorLabel: "cat" },
  { id: "pet_shadow", displayName: "Shadow", species: "cat", breed: "Black Shorthair", detectorLabel: "cat" },
];

export function petsOfSpecies(species: PetSpecies): PetMember[] {
  return PET_ROSTER.filter((p) => p.species === species);
}
