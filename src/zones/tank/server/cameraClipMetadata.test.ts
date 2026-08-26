import { afterEach, describe, expect, test } from "bun:test";
import { getLoopObjectUrl } from "../mediaPlayback";
import { projectRecentClip, type ClipRow } from "./cameraClipMetadata";

const OLD_MAX_AGE = process.env.TANK_CLIP_MAX_AGE_SECONDS;
const OLD_BROWSER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER;

afterEach(() => {
  process.env.TANK_CLIP_MAX_AGE_SECONDS = OLD_MAX_AGE;
  process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER = OLD_BROWSER_URL;
});

function row(overrides: Partial<ClipRow> = {}): ClipRow {
  return {
    camera_id: "cam-1786768240090",
    storage_path: "cameras/cam-1786768240090/1787679000.mp4",
    captured_at: "2026-08-25T17:30:00.000Z",
    source_stable_at: "2026-08-25T17:27:45.000Z",
    duration_seconds: 120,
    generation: 1787679000,
    ...overrides,
  };
}

describe("Tank recent clip freshness", () => {
  test("advertises a validated clip only inside the freshness window", () => {
    process.env.TANK_CLIP_MAX_AGE_SECONDS = "1800";
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER = "https://db.unenter.live";
    const result = projectRecentClip(
      row(),
      "cam-1786768240090",
      Date.parse("2026-08-25T17:45:00.000Z"),
    );
    expect(result?.recentClipStatus).toBe("ready");
    expect(result?.recentClipUrl).toContain("/1787679000.mp4");
  });

  test("withholds old bytes instead of silently replaying stale footage", () => {
    process.env.TANK_CLIP_MAX_AGE_SECONDS = "1800";
    const result = projectRecentClip(
      row(),
      "cam-1786768240090",
      Date.parse("2026-08-25T18:01:00.000Z"),
    );
    expect(result?.recentClipStatus).toBe("stale");
    expect(result?.recentClipUrl).toBeNull();
  });

  test("rejects a storage path belonging to another camera", () => {
    const result = projectRecentClip(
      row({ storage_path: "cameras/cam-other/1787679000.mp4" }),
      "cam-1786768240090",
      Date.parse("2026-08-25T17:31:00.000Z"),
    );
    expect(result).toBeNull();
  });

  test("object URL builder only accepts versioned camera MP4 paths", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER = "https://db.unenter.live";
    expect(getLoopObjectUrl("cameras/cam-1/1787679000.mp4")).toBe(
      "https://db.unenter.live/storage/v1/object/public/tank-loops/cameras/cam-1/1787679000.mp4",
    );
    expect(getLoopObjectUrl("cameras/cam-1.mp4")).toBeNull();
    expect(getLoopObjectUrl("../private/secret.mp4")).toBeNull();
  });
});
