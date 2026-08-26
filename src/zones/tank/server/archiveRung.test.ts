import { describe, expect, test } from "bun:test";
import {
  cameraArchiveMediaPath,
  cameraHlsLowMediaPath,
  cameraMediaPath,
  getCameraLoopUrl,
  getCameraShareImageUrl,
  getObsRoomShareImageUrl,
  ARCHIVE_BUCKET,
  LOOP_BUCKET,
} from "../mediaPlayback";
import { needsVideoTranscode } from "./mediaGateway";

describe("Tank archive rung paths", () => {
  test("the archive rung is its own path, distinct from every delivery rung", () => {
    const id = "cam-1786768240090";
    expect(cameraArchiveMediaPath(id)).toBe("cameras/cam-1786768240090-archive");

    // The archive must not collide with any delivery rung — recording is
    // configured on this path alone, and an overlap would either record the
    // wrong rung or apply record settings to a viewer-facing stream.
    const all = [
      cameraMediaPath(id),
      cameraHlsLowMediaPath(id),
      cameraArchiveMediaPath(id),
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  test("the hook's camera-id derivation round-trips the archive path", () => {
    // mediamtx/scripts/on-segment-complete.sh recovers the camera id with
    // `sed 's#^cameras/##; s#-archive$##'`. If this stops matching, every
    // recorded segment indexes under a wrong or empty camera id.
    const id = "cam-1786768240090";
    const path = cameraArchiveMediaPath(id);
    const derived = path.replace(/^cameras\//, "").replace(/-archive$/, "");
    expect(derived).toBe(id);
  });
});

describe("Preroll loop URLs", () => {
  const OLD_BROWSER = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER;
  const OLD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

  test("points at the public loop bucket using the browser-facing host", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER = "https://db.unenter.live";
    // Split-horizon: the internal kong URL must never reach a browser.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://kong:8000";

    expect(getCameraLoopUrl("cam-1786768240090")).toBe(
      "https://db.unenter.live/storage/v1/object/public/tank-loops/cameras/cam-1786768240090.mp4",
    );

    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER = OLD_BROWSER;
    process.env.NEXT_PUBLIC_SUPABASE_URL = OLD_URL;
  });

  test("returns null rather than a broken URL when unconfigured", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER = "https://db.unenter.live";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.unenter.live";
    // A null poster just leaves the old black frame; a malformed one makes the
    // browser fetch garbage on every player mount.
    expect(getCameraLoopUrl("")).toBeNull();
    expect(getCameraLoopUrl("!!!")).toBeNull();

    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER = OLD_BROWSER;
    process.env.NEXT_PUBLIC_SUPABASE_URL = OLD_URL;
  });

  test("loops and footage live in different buckets", () => {
    // tank-loops is public (poster frames, shown signed-out); tank-archives is
    // private (members only, signed URLs). Collapsing them would expose footage.
    expect(LOOP_BUCKET).not.toBe(ARCHIVE_BUCKET);
  });

  test("builds public share-image URLs without exposing an ingest path", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER = "https://db.unenter.live";
    expect(getCameraShareImageUrl("cam-1786768240090")).toBe(
      "https://db.unenter.live/storage/v1/object/public/tank-loops/cameras/cam-1786768240090.jpg",
    );
    expect(getObsRoomShareImageUrl("Admin Room")).toBe(
      "https://db.unenter.live/storage/v1/object/public/tank-loops/rooms/admin-room.jpg",
    );
    expect(getCameraShareImageUrl("!!!")).toBeNull();

    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER = OLD_BROWSER;
    process.env.NEXT_PUBLIC_SUPABASE_URL = OLD_URL;
  });
});

describe("Browser-safe video codec normalisation", () => {
  test("H.265 is flagged for transcode, H.264 is not", () => {
    // The IRL cam bug: an SRTLA phone encoder defaulting to HEVC. The path goes
    // ready and streams real bytes, but WebRTC won't negotiate HEVC in Chrome
    // or Firefox and hls.js can't carry it in MPEG-TS, so viewers get a black
    // frame from a camera that looks perfectly healthy in the registry.
    expect(needsVideoTranscode("H265")).toBe(true);
    expect(needsVideoTranscode("h265")).toBe(true);
    expect(needsVideoTranscode("H264")).toBe(false);
  });

  test("codecs browsers can already play are left on copy", () => {
    // Re-encoding these would burn a core per camera for nothing.
    for (const codec of ["H264", "AV1", "VP8", "VP9"]) {
      expect(needsVideoTranscode(codec)).toBe(false);
    }
  });

  test("an unknown or not-yet-ready path does not trigger a transcode", () => {
    // On first provision there are no tracks to read. Defaulting to "transcode"
    // there would put every brand-new camera through a needless encode before
    // anyone knows what it publishes.
    expect(needsVideoTranscode(null)).toBe(false);
  });
});

describe("Camera archive segment staggering", () => {
  test("generates different segment intervals across different camera IDs", () => {
    const { calculateStaggeredSegmentDuration } = require("./mediaGateway");
    const cam0 = calculateStaggeredSegmentDuration("cam-1786768240090", "10m");
    const cam1 = calculateStaggeredSegmentDuration("cam-1786768240091", "10m");
    const cam2 = calculateStaggeredSegmentDuration("cam-1786768240092", "10m");
    const cam3 = calculateStaggeredSegmentDuration("cam-1786768240093", "10m");

    const durations = [cam0, cam1, cam2, cam3];
    // Each camera gets a valid second duration within [555s, 645s]
    for (const d of durations) {
      const sec = parseInt(d.replace("s", ""), 10);
      expect(sec).toBeGreaterThanOrEqual(555);
      expect(sec).toBeLessThanOrEqual(645);
    }
    // Ensures they are not all identical (staggered to prevent synchronized upload collision)
    const unique = new Set(durations);
    expect(unique.size).toBeGreaterThan(1);
  });

  test("handles unconfigured or missing camera IDs with clean default", () => {
    const { calculateStaggeredSegmentDuration } = require("./mediaGateway");
    expect(calculateStaggeredSegmentDuration(undefined, "10m")).toBe("600s");
  });

  test("disqualifies loops and ephemeral prerolls from 24-hour archive ingestion", async () => {
    const { ingestArchiveSegment } = require("./archiveSegments");
    const loopRes = await ingestArchiveSegment({
      cameraId: "cam-1786768240090",
      storagePath: "tank-loops/cameras/cam-1786768240090.mp4",
      fileSizeBytes: 2048000,
      durationSeconds: 120,
      segmentStart: new Date().toISOString(),
      fileName: "preroll-cam-1786768240090.mp4",
    });
    expect(loopRes.success).toBe(false);
    expect(loopRes.error).toContain("disqualified from 24-hour archive material");
  });
});
