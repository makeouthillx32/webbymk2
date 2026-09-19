import { describe, expect, test } from "bun:test";
import {
  deriveDirectorHlsUrl,
  hasNewDecodedPicture,
  type VideoPictureProbe,
} from "./directorPlayback";

const base: VideoPictureProbe = {
  readyState: 0,
  currentTime: 0,
  videoWidth: 0,
  videoHeight: 0,
  decodedFrames: 0,
};

describe("hasNewDecodedPicture", () => {
  test("rejects signalling without a video picture", () => {
    expect(
      hasNewDecodedPicture(base, {
        ...base,
        readyState: 4,
        currentTime: 1,
      }),
    ).toBe(false);
  });

  test("accepts a dimensioned picture after the media clock advances", () => {
    expect(
      hasNewDecodedPicture(base, {
        ...base,
        readyState: 4,
        currentTime: 0.067,
        videoWidth: 1920,
        videoHeight: 1080,
      }),
    ).toBe(true);
  });

  test("accepts a decoded frame when a MediaStream clock is not useful", () => {
    expect(
      hasNewDecodedPicture(base, {
        ...base,
        readyState: 2,
        videoWidth: 3840,
        videoHeight: 2160,
        decodedFrames: 1,
      }),
    ).toBe(true);
  });
});

describe("deriveDirectorHlsUrl", () => {
  test("maps a camera WHEP path to its AAC HLS sibling", () => {
    expect(
      deriveDirectorHlsUrl("https://media.tank.unenter.live/cameras/cam-1/whep"),
    ).toBe("https://media.tank.unenter.live/cameras/cam-1-hls/index.m3u8");
  });

  test("maps an OBS WHEP sibling back to the room HLS path", () => {
    expect(
      deriveDirectorHlsUrl("https://media.tank.unenter.live/obs/admin-room-whep/whep"),
    ).toBe("https://media.tank.unenter.live/obs/admin-room/index.m3u8");
  });

  test("preserves query strings and rejects unknown endpoints", () => {
    expect(
      deriveDirectorHlsUrl("https://media.tank.unenter.live/cameras/cam-1/whep?token=x"),
    ).toBe("https://media.tank.unenter.live/cameras/cam-1-hls/index.m3u8?token=x");
    expect(deriveDirectorHlsUrl("https://example.test/video")).toBeNull();
  });
});
