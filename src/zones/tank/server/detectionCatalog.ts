// Universal Detection Target Catalog
// ─────────────────────────────────────────────────────────────────────────────
// SQL-like JSON registry of all detectable entities across Tank camera feeds:
// House members (Tyler, Malia), pets (Molly, Olly, James, Kitty), trash and props.
//
// Detection resolves in TWO TIERS, and they must not be conflated:
//
//   tier 1  CLASS     what the detector actually knows: person / cat / dog.
//                     Comes straight from YOLO and is trustworthy.
//   tier 2  IDENTITY  which person or which animal. The detector cannot see
//                     this at all — every dog is "dog" to it.
//
// HOUSE MEMBERS HAVE NO ROOM. This is Tyler's house; Tyler, Malia and Joe live
// in it and move through all of it. `primaryRoom` was carried on each of them
// and is a fiction — a person is not resident in one room, and narrowing by it
// produced confidently wrong names (two people in "Joe's room" who were Tyler
// and Malia both resolved to JOE). Removed 2026-09-12 on the owner's
// correction.
//
// What names a person instead is APPEARANCE — see
// src/zones/tank/vision/appearance.ts. The worker holds the decoded frame,
// cuts each person's crop, and compares it against signatures captured during
// enrolment; what reaches resolveDetection is `appearanceSlug`, a decision
// already through both of that module's gates. It is the only per-body
// evidence in this file, so it outranks every room rule below.
//
// With no appearance match and no room prior, a person detection CANNOT be
// narrowed to an individual and resolves to the generic class. No name is the
// correct answer there; the alternative was a wrong one.
//
// Pets keep `knownHabitats` as operator-facing context only. A room is not
// identity evidence: Olly can walk into Molly's usual room. Habitats must never
// put a pet name on a box without an appearance match.
//
// Entries below are tier-2 records. Reading one as if the detector produced it
// is the mistake: with two dogs enrolled, a "dog" box could be Molly or Olly
// and picking the first match would put a confident wrong name on screen.
// resolveDetection() below keeps the two apart and only names an individual
// when the evidence actually narrows to one.
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
    metadata: { role: "Owner", clan: "Syndicate", heightCm: 178 },
  },
  {
    // Restored 2026-09-12. Removed in b78c3c0 as an apparent placeholder — he
    // is a real house member.
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
    metadata: { role: "Resident", clan: "Raiders", heightCm: 188 },
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
    metadata: { role: "Resident", clan: "Night Owls", heightCm: 162 },
  },


  {
    // A real, known guest — enrolled so appearance matching has something to
    // match against, NOT so the room heuristic can name her.
    //
    // Deliberately no primaryRoom. resolveDetection narrows by room, so giving
    // a guest one would make her a rival candidate in that room and stop the
    // RESIDENT there being named — adding a name would subtract two. A guest
    // also moves around by definition, which is exactly what a room prior
    // cannot model. She reads as a generic person until somebody enrols her
    // appearance, and that is the honest answer rather than a guess.
    id: "guest_trisha",
    category: "guest",
    slug: "trisha",
    displayName: "TRISHA",
    yoloClassIds: ["person"],
    referenceImages: ["/images/tank-references/guests/trisha_01.jpg"],
    confidenceThreshold: 0.82,
    boxColor: "#38bdf8",
    badgeBg: "#0284c7",
    pointValue: 50,
    priority: "normal",
    metadata: { role: "Guest" },
  },
  // ── PETS & ANIMALS ──
  // ids match DEFAULT_HOUSE_ANIMALS in houseAnimals.ts so a detection resolves
  // to a pet profile.
  //
  // `referenceImages` on these records is DEAD — those files were never created
  // and nothing reads the field. It survives only because the type is shared
  // with props and toys that do carry real art. Per-individual matching does
  // NOT come from here: it comes from captured signatures in
  // tank_appearance_enrolment, because a signature has to be cut from the same
  // kind of frame it will later be compared against. A studio photo of Molly
  // says nothing about how she looks on a ceiling camera at night.
  {
    id: "pet_molly",
    category: "pet_animal",
    slug: "molly",
    displayName: "MOLLY",
    yoloClassIds: ["dog"],
    referenceImages: ["/images/tank-references/pets/molly_01.jpg"],
    confidenceThreshold: 0.70,
    boxColor: "#eab308",
    badgeBg: "#a16207",
    pointValue: 25,
    priority: "normal",
    // Room keys here MUST match tank_camera_registry.room_scope / tank_rooms.room_key
    // exactly — this is a string join with no referential integrity behind it.
    // "the-foyer" sat here and matched nothing: the canonical key is "foyer"
    // (the room is *titled* "The Foyer"), so in the one room only Molly
    // frequents, both dogs stayed candidates and she never got named.
    metadata: { breed: "Yellow Lab", knownHabitats: ["foyer", "living-room"] },
  },
  {
    id: "pet_olly",
    category: "pet_animal",
    slug: "olly",
    displayName: "OLLY",
    yoloClassIds: ["dog"],
    referenceImages: ["/images/tank-references/pets/olly_01.jpg"],
    confidenceThreshold: 0.70,
    boxColor: "#06b6d4",
    badgeBg: "#0891b2",
    pointValue: 25,
    priority: "normal",
    metadata: { breed: "Brindle Boxer", knownHabitats: ["game-room", "living-room"] },
  },
  {
    id: "pet_james",
    category: "pet_animal",
    slug: "james",
    displayName: "JAMES",
    yoloClassIds: ["cat"],
    referenceImages: ["/images/tank-references/pets/james_01.jpg"],
    confidenceThreshold: 0.70,
    boxColor: "#f97316",
    badgeBg: "#ea580c",
    pointValue: 30,
    priority: "normal",
    metadata: { breed: "Orange Tabby", knownHabitats: ["living-room", "kitchen"] },
  },
  {
    id: "pet_kitty",
    category: "pet_animal",
    slug: "kitty",
    displayName: "KITTY",
    yoloClassIds: ["cat"],
    referenceImages: ["/images/tank-references/pets/kitty_01.jpg"],
    confidenceThreshold: 0.70,
    boxColor: "#a78bfa",
    badgeBg: "#7c3aed",
    pointValue: 30,
    priority: "normal",
    metadata: { breed: "Black Cat", knownHabitats: ["living-room", "makeup-room"] },
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

// ── Tiered resolution ───────────────────────────────────────────────────────

/** What the detector itself can distinguish. Tier 1. */
export type DetectedClass = "person" | "cat" | "dog";

export type DetectionResolution = {
  /** Always present — the detector's own answer. */
  detectedClass: DetectedClass;
  /** What to render. The individual's name once known, else the class. */
  label: string;
  /** The resolved individual, or null when the evidence does not narrow to one. */
  target: DetectionTargetRecord | null;
  /** Every enrolled individual this detection could still be. */
  candidates: DetectionTargetRecord[];
  /** Why it resolved — or why it could not. Surfaced in the overlay tooltip. */
  reason: string;
};

const CLASS_FALLBACK_LABEL: Record<DetectedClass, string> = {
  person: "HOUSE MEMBER",
  cat: "CAT",
  dog: "DOG",
};

/**
 * Resolve a raw detector hit to an individual, when the evidence allows it.
 *
 *   is person  ->  is house member  ->  is Tyler or is Malia
 *   is cat     ->  which cat
 *
 * Evidence is taken strongest-first:
 *
 *   1. `appearanceSlug` — what this body actually looks like. Per-body, so it
 *      settles the case outright.
 *   2. sole enrolment — only one cat exists, so a cat box is that cat.
 *   3. `roomKey` via knownHabitats — a prior about the ROOM, not the animal.
 *      Only Molly frequents the foyer, so a lone dog there is probably Molly.
 *
 * Each tier narrows honestly rather than guessing: two dogs in a room both of
 * them frequent stays "DOG", because a wrong name is worse than no name — it
 * teaches the operator to distrust every label on screen.
 */
export function resolveDetection(
  detectedClass: DetectedClass,
  opts: {
    roomKey?: string | null;
    /**
     * How many subjects of this class are in frame right now.
     *
     * Room narrowing answers "who is ENROLLED for this room", not "who is this
     * particular body". With one person in Joe's room that distinction does not
     * matter. With two it is guaranteed wrong: both boxes get labelled JOE,
     * and if the people are actually Tyler and Malia the overlay states two
     * confident falsehoods at once.
     *
     * Observed on 2026-09-12 — two people in game-room-2 who were not Joe.
     * Passing the count lets the resolver decline instead, which is the whole
     * posture of this module: a wrong name is worse than no name, because it
     * teaches the operator to distrust every label on screen.
     */
    subjectCount?: number;
    /**
     * The slug an appearance match already settled on for THIS box, if any.
     *
     * The caller does the matching because only it holds the pixels — the
     * worker has the decoded frame, this module has the roster. What arrives
     * here is a decision, already through both of appearance.ts's gates (it
     * looks like them, AND it looks like them more than anyone else).
     *
     * This is the only genuinely per-body evidence in the function. Everything
     * below it answers "who is enrolled for this room", which is a statement
     * about the ROOM; this answers "who is this", which is the actual question.
     * It therefore wins outright, including over the subject-count guard that
     * exists precisely because room narrowing cannot tell two bodies apart.
     */
    appearanceSlug?: string | null;
  } = {},
): DetectionResolution {
  const enrolled = INITIAL_DETECTION_CATALOG.filter((t) =>
    t.yoloClassIds.includes(detectedClass),
  );

  // Living subjects move. Neither "the only enrolled target" nor "usually in
  // this room" identifies the body in this frame. Every person/cat/dog name
  // therefore requires per-box appearance evidence; otherwise return the
  // detector class and let the overlay honestly say PERSON, CAT, or DOG.
  const requiresAppearance = detectedClass === "person" || detectedClass === "cat" || detectedClass === "dog";

  if (enrolled.length === 0) {
    return {
      detectedClass,
      label: CLASS_FALLBACK_LABEL[detectedClass],
      target: null,
      candidates: [],
      reason: `No individual enrolled for "${detectedClass}"`,
    };
  }

  // Appearance first — it is the only evidence about this particular body.
  if (opts.appearanceSlug) {
    // Scoped to `enrolled`, not the whole catalog: a match that names a CAT for
    // a dog box would mean the caller compared against the wrong roster, and
    // silently accepting it would print "JAMES" over a dog. Fall through to
    // generic instead, which is visible as a missing name rather than a wrong one.
    const matched = enrolled.find((t) => t.slug === opts.appearanceSlug);
    if (matched) {
      return {
        detectedClass,
        label: matched.displayName,
        target: matched,
        candidates: enrolled,
        reason: `Appearance matched ${matched.displayName}`,
      };
    }
  }

  if (requiresAppearance) {
    return {
      detectedClass,
      label: CLASS_FALLBACK_LABEL[detectedClass],
      target: null,
      candidates: enrolled,
      reason:
        `${enrolled.length} ${detectedClass}s enrolled (` +
        enrolled.map((t) => t.displayName).join(", ") +
        `) — no per-subject appearance match`,
    };
  }

  if (enrolled.length === 1 && (opts.subjectCount ?? 1) === 1) {
    return {
      detectedClass,
      label: enrolled[0].displayName,
      target: enrolled[0],
      candidates: enrolled,
      reason: `Only one ${detectedClass} enrolled`,
    };
  }

  // Cannot attribute one enrolment across several bodies.
  const subjectCount = opts.subjectCount ?? 1;
  if (subjectCount > 1) {
    return {
      detectedClass,
      label: CLASS_FALLBACK_LABEL[detectedClass],
      target: null,
      candidates: enrolled,
      reason: `${subjectCount} ${detectedClass}s in frame — room narrowing cannot say which is which`,
    };
  }

  // More than one candidate — try to narrow by room before giving up.
  const room = opts.roomKey ?? null;
  if (room) {
    const inRoom = enrolled.filter((t) => {
      // Pets carry knownHabitats — several rooms an animal is often recorded
      // in. House members carry NO room at all: this is one household and they
      // move through all of it, so there is nothing here to narrow a person by.
      // `primaryRoom` is still read because a future non-member target (a
      // fixed prop, say) could legitimately have one; no person does.
      const habitats = t.metadata?.knownHabitats;
      if (Array.isArray(habitats) && habitats.includes(room)) return true;
      return t.metadata?.primaryRoom === room;
    });
    if (inRoom.length === 1) {
      return {
        detectedClass,
        label: inRoom[0].displayName,
        target: inRoom[0],
        candidates: enrolled,
        reason: `Only ${inRoom[0].displayName} frequents ${room}`,
      };
    }
  }

  return {
    detectedClass,
    label: CLASS_FALLBACK_LABEL[detectedClass],
    target: null,
    candidates: enrolled,
    reason:
      `${enrolled.length} ${detectedClass}s enrolled (` +
      enrolled.map((t) => t.displayName).join(", ") +
      `) — needs per-individual matching to name`,
  };
}
