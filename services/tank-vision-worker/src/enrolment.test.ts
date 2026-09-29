import { describe, expect, test } from "bun:test";
import { SIGNATURE_LENGTH } from "../../../src/zones/tank/vision/appearance";
import { compileEnrolmentRows } from "./enrolment";

const signature = (length: number) =>
  Array.from({ length }, (_, index) => index / length);

describe("vision-worker enrolment roster", () => {
  test("loads runtime-compatible signatures into strict detector classes", () => {
    const result = compileEnrolmentRows([
      {
        target_slug: "tyler",
        signature: signature(SIGNATURE_LENGTH),
        signature_length: SIGNATURE_LENGTH,
      },
      {
        target_slug: "kitty",
        signature: signature(SIGNATURE_LENGTH),
        signature_length: SIGNATURE_LENGTH,
      },
      {
        target_slug: "molly",
        signature: signature(SIGNATURE_LENGTH),
        signature_length: SIGNATURE_LENGTH,
      },
    ]);
    expect(result.byClass.get("person")?.map((entry) => entry.slug)).toEqual([
      "tyler",
    ]);
    expect(result.byClass.get("cat")?.map((entry) => entry.slug)).toEqual([
      "kitty",
    ]);
    expect(result.byClass.get("dog")?.map((entry) => entry.slug)).toEqual([
      "molly",
    ]);
    expect(result.byTarget).toEqual({ tyler: 1, kitty: 1, molly: 1 });
  });

  test("rejects offline 512-value vectors instead of silently scoring them as zero", () => {
    const result = compileEnrolmentRows([
      {
        target_slug: "tyler",
        signature: signature(512),
        signature_length: 512,
      },
    ]);
    expect(result.signatures).toBe(0);
    expect(result.rejected[0]).toContain(
      "incompatible with the live 40-value probe",
    );
  });

  test("rejects a lying signature_length", () => {
    const result = compileEnrolmentRows([
      {
        target_slug: "joe",
        signature: signature(SIGNATURE_LENGTH),
        signature_length: 512,
      },
    ]);
    expect(result.signatures).toBe(0);
    expect(result.rejected[0]).toContain("does not match vector length");
  });
});
