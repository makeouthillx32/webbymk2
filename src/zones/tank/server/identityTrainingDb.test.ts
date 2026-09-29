import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Tank staff identity index boundary", () => {
  test("returns aggregate metadata without exposing identity vectors or crop paths", () => {
    const source = readFileSync(join(import.meta.dir, "identityTrainingDb.ts"), "utf8");

    expect(source).toContain('.from("tank_identity_training_summary")');
    expect(source).toContain('.select("target_slug, active_references, confirmed_samples, quarantined_samples, rejected_samples")');
    expect(source).not.toContain('.select("embedding');
    expect(source).not.toContain('.select("crop_path');
    expect(source).not.toContain('.select("source_sha256');
    expect(source).not.toContain('.select("source_path');
  });

  test("the Members deck presents a privacy-safe, human-readable identity registry", () => {
    const panel = readFileSync(
      join(import.meta.dir, "..", "house", "AppearanceEnrolment", "AppearanceEnrolmentPanel.tsx"),
      "utf8",
    );

    expect(panel).toContain("Household Identity Registry");
    expect(panel).toContain("Human-readable, privacy-safe view");
    expect(panel).toContain("Camera evidence coverage");
    expect(panel).toContain("Embeddings");
    expect(panel).not.toContain("3-Sec Walk Burst");
    expect(panel).not.toContain("Single Shot");
  });
});
