import { describe, expect, test } from "bun:test";
import {
  matchAppearance,
  type EnrolledAppearance,
} from "../../../src/zones/tank/vision/appearance";
import {
  PET_SAME_CLASS_THRESHOLDS,
} from "./identityPolicy";
import { RUNTIME_IDENTITY_SEEDS } from "./runtimeIdentitySeed";

type Outcome = { correct: number; declined: number; wrong: number };

function leaveOneOut(detectedClass: "cat" | "dog"): Outcome {
  const reviewed = RUNTIME_IDENTITY_SEEDS.filter(
    (seed) =>
      seed.sourceKind === "archive-reviewed" &&
      seed.detectedClass === detectedClass,
  );
  const outcome: Outcome = { correct: 0, declined: 0, wrong: 0 };

  for (const probe of reviewed) {
    const candidates = RUNTIME_IDENTITY_SEEDS.filter(
      (seed) =>
        seed.id !== probe.id &&
        seed.detectedClass === probe.detectedClass,
    );
    const bySlug = new Map<string, EnrolledAppearance>();
    for (const seed of candidates) {
      const current = bySlug.get(seed.targetSlug) ?? {
        slug: seed.targetSlug,
        displayName: seed.targetSlug,
        signatures: [],
      };
      current.signatures.push(seed.signature);
      bySlug.set(seed.targetSlug, current);
    }

    const match = matchAppearance(
      probe.signature,
      [...bySlug.values()],
      PET_SAME_CLASS_THRESHOLDS,
    );
    if (!match) outcome.declined += 1;
    else if (match.slug === probe.targetSlug) outcome.correct += 1;
    else outcome.wrong += 1;
  }

  return outcome;
}

describe("runtime identity confidence policy", () => {
  test("same-species matching names 8/10 reviewed CCTV crops with zero wrong names", () => {
    const cat = leaveOneOut("cat");
    const dog = leaveOneOut("dog");
    expect({
      correct: cat.correct + dog.correct,
      declined: cat.declined + dog.declined,
      wrong: cat.wrong + dog.wrong,
    }).toEqual({
      correct: 8,
      declined: 2,
      wrong: 0,
    });
  });

  test("the live worker contains no cross-species fallback policy", async () => {
    const observer = await Bun.file(new URL("./observer.ts", import.meta.url)).text();
    expect(observer).not.toContain("PET_CROSS_CLASS_THRESHOLDS");
    expect(observer).not.toContain('this.enrolled.get("cat") ?? []),\n        ...(this.enrolled.get("dog")');
  });
});
