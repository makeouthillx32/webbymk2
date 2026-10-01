import { describe, expect, test } from "bun:test";
import { buildSourceDir, refCandidates } from "./build-ref";
import { gitPathArg } from "./git-bin";

describe("refCandidates", () => {
  test("branches resolve to the forge's copy first", () => {
    expect(refCandidates("main")).toEqual(["origin/main", "main"]);
    expect(refCandidates("feat/x")).toEqual(["origin/feat/x", "feat/x"]);
  });
  test("a commit hash is used as-is", () => {
    expect(refCandidates("3fba27f5")).toEqual(["3fba27f5"]);
  });
});

describe("paths", () => {
  test("one build folder per zone, with unsafe characters replaced", () => {
    expect(buildSourceDir("docs").endsWith("build-src/docs") || buildSourceDir("docs").endsWith("build-src\\docs")).toBe(true);
    expect(buildSourceDir("a b/c")).toMatch(/a-b-c$/);
  });
  test("non-WSL paths pass through unchanged", () => {
    expect(gitPathArg(".", "C:/Users/x")).toBe("C:/Users/x");
    expect(gitPathArg(".", "/srv/x")).toBe("/srv/x");
  });
});
