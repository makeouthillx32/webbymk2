import { describe, expect, test } from "bun:test";
import { getTargetBySlug, INITIAL_DETECTION_CATALOG, resolveDetection } from "./detectionCatalog";

// Tier 1 (class) comes from the detector and is trustworthy. Tier 2 (which
// individual) is inferred from the room, and the join is a bare string compare
// against tank_camera_registry.room_scope with no foreign key behind it. A typo
// on either side silently degrades every label to the generic class instead of
// failing loudly — "the-foyer" vs "foyer" did exactly that to Molly. Hence the
// canonical-keys test below.

/**
 * Room keys that actually exist, verified against tank_rooms.room_key and
 * tank_camera_registry.room_scope in the live DB on 2026-09-09.
 *
 * `kitchen` is a camera room_scope with no tank_rooms row yet; resolveDetection
 * is fed the camera's scope, so it still narrows correctly.
 */
const CANONICAL_ROOM_KEYS = new Set([
  "admin",
  "basement",
  "director",
  "foyer",
  "game-room",
  "game-room-2",
  "global",
  "irl",
  "irl-1",
  "irl-2",
  "kitchen",
  "living-room",
  "makeup-room",
  "roaming",
  "unscoped",
]);

describe("catalog room keys are canonical", () => {
  test("every knownHabitats entry names a room that exists", () => {
    const offenders: string[] = [];
    for (const target of INITIAL_DETECTION_CATALOG) {
      const habitats = target.metadata?.knownHabitats;
      if (!Array.isArray(habitats)) continue;
      for (const room of habitats) {
        if (!CANONICAL_ROOM_KEYS.has(room)) {
          offenders.push(`${target.slug} -> ${room}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every primaryRoom names a room that exists", () => {
    const offenders: string[] = [];
    for (const target of INITIAL_DETECTION_CATALOG) {
      const room = target.metadata?.primaryRoom;
      if (typeof room !== "string") continue;
      if (!CANONICAL_ROOM_KEYS.has(room)) offenders.push(`${target.slug} -> ${room}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("tier 2 refuses to turn room context into identity", () => {
  test("the only dog associated with the foyer still needs appearance evidence", () => {
    // Habitats are useful context for an operator, but an animal can walk into
    // another animal's usual room. The box stays generic until it matches the
    // enrolled animal itself.
    const r = resolveDetection("dog", { roomKey: "foyer" });
    expect(r.target).toBeNull();
    expect(r.label).toBe("DOG");
    expect(r.detectedClass).toBe("dog");
  });

  test("two dogs sharing a room stay generic rather than guessing", () => {
    const r = resolveDetection("dog", { roomKey: "living-room" });
    expect(r.target).toBeNull();
    expect(r.label).toBe("DOG");
    expect(r.candidates.map((c) => c.slug).sort()).toEqual(["molly", "olly"]);
  });

  test("a person is NEVER named from the room they are standing in", () => {
    // This is Tyler's house and the members move through all of it. Rooms said
    // nothing about who a person is, and pretending otherwise produced
    // confident falsehoods — two people in "Joe's room" who were Tyler and
    // Malia both resolved to JOE.
    for (const room of ["game-room", "game-room-2", "living-room", "kitchen", "foyer"]) {
      const r = resolveDetection("person", { roomKey: room });
      expect(r.target).toBeNull();
      expect(r.label).toBe("HOUSE MEMBER");
    }
  });

  test("no house member carries a room", () => {
    for (const slug of ["tyler", "malia", "joe"]) {
      const member = getTargetBySlug(slug);
      expect(member).toBeDefined();
      expect(member!.metadata?.primaryRoom).toBeUndefined();
    }
  });

  test("no room at all falls back to the class, never to a guess", () => {
    const r = resolveDetection("cat", {});
    expect(r.target).toBeNull();
    expect(r.label).toBe("CAT");
  });

  test("cats stay generic in both of their usual rooms without a match", () => {
    expect(resolveDetection("cat", { roomKey: "makeup-room" }).label).toBe("CAT");
    expect(resolveDetection("cat", { roomKey: "kitchen" }).label).toBe("CAT");
  });

  test("every resolution explains itself", () => {
    for (const room of ["foyer", "living-room", "game-room", null]) {
      for (const cls of ["person", "cat", "dog"] as const) {
        const r = resolveDetection(cls, { roomKey: room });
        expect(r.reason.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("catalog shape", () => {
  test("all three house members are enrolled", () => {
    // Tyler owns the house; Malia and Joe live in it. Joe was deleted in
    // b78c3c0 as an apparent placeholder and is not one.
    for (const slug of ["tyler", "malia", "joe"]) {
      expect(getTargetBySlug(slug)).toBeDefined();
    }
  });

  test("a guest is enrolled for appearance matching, not for room narrowing", () => {
    const trisha = getTargetBySlug("trisha");
    expect(trisha).toBeDefined();
    expect(trisha!.metadata?.primaryRoom).toBeUndefined();
  });

  test("all four named pets are enrolled, none generic", () => {
    const pets = ["molly", "olly", "james", "kitty"];
    for (const slug of pets) expect(getTargetBySlug(slug)).toBeDefined();
  });

  test("slugs are unique", () => {
    const slugs = INITIAL_DETECTION_CATALOG.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("ids are unique", () => {
    const ids = INITIAL_DETECTION_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every target carries at least one yolo class it answers to", () => {
    for (const t of INITIAL_DETECTION_CATALOG) {
      expect(Array.isArray(t.yoloClassIds)).toBe(true);
    }
  });
});

describe("appearance outranks every room rule", () => {
  test("an appearance match names a person the room never could", () => {
    // The whole point of the build. Rooms say nothing about who a person is,
    // so without this a person detection can only ever read HOUSE MEMBER.
    const r = resolveDetection("person", { roomKey: "game-room-2", appearanceSlug: "tyler" });
    expect(r.target?.slug).toBe("tyler");
    expect(r.label).toBe("TYLER");
    expect(r.reason).toContain("Appearance");
  });

  test("two people in one frame are each named on their own evidence", () => {
    // subjectCount > 1 blocks room narrowing because one enrolment cannot be
    // spread across two bodies. Appearance is per-body, so it is exactly the
    // evidence that guard was waiting for — it must not be blocked by it.
    const tyler = resolveDetection("person", {
      roomKey: "game-room-2",
      subjectCount: 2,
      appearanceSlug: "tyler",
    });
    const malia = resolveDetection("person", {
      roomKey: "game-room-2",
      subjectCount: 2,
      appearanceSlug: "malia",
    });
    expect(tyler.label).toBe("TYLER");
    expect(malia.label).toBe("MALIA");
  });

  test("a matched guest is named, not flattened into the house", () => {
    const r = resolveDetection("person", { roomKey: "living-room", appearanceSlug: "trisha" });
    expect(r.target?.slug).toBe("trisha");
    expect(r.label).toBe("TRISHA");
  });

  test("appearance names a pet even outside its usual room", () => {
    const roomOnly = resolveDetection("dog", { roomKey: "foyer" });
    expect(roomOnly.label).toBe("DOG");

    const seen = resolveDetection("dog", { roomKey: "foyer", appearanceSlug: "olly" });
    expect(seen.label).toBe("OLLY");
  });

  test("a match from the wrong class roster is refused, not printed", () => {
    // "james" is a cat. Arriving on a dog box means the caller compared against
    // the wrong roster; accepting it would stamp a cat name over a dog. Falling
    // through to the generic class makes the bug visible as a missing name
    // instead of a confidently wrong one.
    const r = resolveDetection("dog", { roomKey: "living-room", appearanceSlug: "james" });
    expect(r.target).toBeNull();
    expect(r.label).toBe("DOG");
  });

  test("an unknown slug is refused rather than crashing the pass", () => {
    const r = resolveDetection("person", { appearanceSlug: "nobody-by-that-name" });
    expect(r.target).toBeNull();
    expect(r.label).toBe("HOUSE MEMBER");
  });

  test("no match at all still means no name", () => {
    // The common case, and it must stay boring: an unenrolled body, or someone
    // in an outfit newer than their enrolment.
    for (const slug of [null, undefined, ""]) {
      const r = resolveDetection("person", { roomKey: "foyer", appearanceSlug: slug });
      expect(r.target).toBeNull();
      expect(r.label).toBe("HOUSE MEMBER");
    }
  });
});
