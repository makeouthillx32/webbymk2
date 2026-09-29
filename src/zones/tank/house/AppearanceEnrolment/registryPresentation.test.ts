import { describe, expect, test } from "bun:test";
import {
  describeIdentityCoverage,
  humanizeIdentitySource,
} from "./registryPresentation";

describe("identity registry presentation", () => {
  test("describes evidence coverage without presenting it as accuracy", () => {
    expect(
      describeIdentityCoverage({ references: 1, confirmedSamples: 12 }),
    ).toMatchObject({
      label: "ROBUST",
      level: "robust",
    });
    expect(
      describeIdentityCoverage({ references: 1, confirmedSamples: 4 }).label,
    ).toBe("GROWING");
    expect(
      describeIdentityCoverage({ references: 1, confirmedSamples: 1 }).label,
    ).toBe("SEEDED");
    expect(
      describeIdentityCoverage({ references: 1, confirmedSamples: 0 }).label,
    ).toBe("REFERENCE ONLY");
    expect(
      describeIdentityCoverage({ references: 0, confirmedSamples: 0 }).label,
    ).toBe("NO DATA");
  });

  test("renders internal source kinds in human language", () => {
    expect(humanizeIdentitySource("archive-reviewed")).toBe("Archive review");
    expect(humanizeIdentitySource("reference-image")).toBe("Reference photo");
    expect(humanizeIdentitySource(null)).toBe("Unspecified source");
  });
});
