import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cosineSimilarity, dismissedPairs } from "./labelLabDb";
import { storageCropObject } from "./identityCropRoute";

// Carried over from the Identity Review workspace when it merged into the
// Label Lab: the guarantees are the screen's, not any one screen's.

describe("Label Lab routes and privacy", () => {
  test("ranks compatible vectors without accepting malformed descriptors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1], [1, 0])).toBeNull();
    expect(cosineSimilarity([], [])).toBeNull();
  });

  test("remembers which look-alikes the operator already said are different", () => {
    const refs = [{ camera: "cam-1" }, { reviewPair: "live-person-a", decision: "different" }, { reviewPair: "live-person-b", decision: "same" }];
    expect([...dismissedPairs(refs)]).toEqual(["live-person-a"]);
    expect(dismissedPairs(null).size).toBe(0);
  });

  test("serves storage crops only from the private identity bucket", () => {
    expect(storageCropObject("storage://tank-identity-crops/live/2026-09-17/g/a.jpg")).toBe("live/2026-09-17/g/a.jpg");
    expect(storageCropObject("storage://tank-archives/secret.mp4")).toBeNull();
    expect(storageCropObject("storage://tank-identity-crops/live/../../x.jpg")).toBeNull();
    expect(storageCropObject("storage://tank-identity-crops/")).toBeNull();
    expect(storageCropObject("/archive/identity-crops/live/a.jpg")).toBeNull();
  });

  test("keeps embeddings and crop paths server-side", () => {
    const db = readFileSync(join(import.meta.dir, "labelLabDb.ts"), "utf8");
    const screen = readFileSync(join(import.meta.dir, "..", "house", "LabelLab", "LabelLab.tsx"), "utf8");
    expect(db).toContain("centroids never leave the server");
    expect(screen).not.toContain("centroid");
    expect(screen).not.toContain("crop_path");
    // The merged screen still does everything both screens did.
    expect(screen).toContain("same-identity");
    expect(screen).toContain("set-crop");
    expect(screen).toContain("include-all");
    expect(screen).toContain("Add guest");
    expect(screen).toContain("Yes to all");
  });

  test("both app trees expose the labels API and the private crop route", () => {
    for (const root of [
      join(import.meta.dir, "..", "..", "..", "app"),
      join(import.meta.dir, "..", "..", "..", "..", "zones", "tank", "src", "app"),
    ]) {
      expect(readFileSync(join(root, "api", "tank", "labels", "route.ts"), "utf8")).toContain("labelLabRouteHandlers");
      expect(readFileSync(join(root, "api", "tank", "appearance", "review", "crop", "route.ts"), "utf8")).toContain("GET_CROP");
      expect(readFileSync(join(root, "house", "labels", "page.tsx"), "utf8")).toContain("LabelLab/Page");
    }
  });
});
