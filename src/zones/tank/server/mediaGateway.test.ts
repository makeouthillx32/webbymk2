import { describe, expect, test } from "bun:test";
import {
  buildPublicCameraPlayback,
  cameraMediaPath,
} from "../mediaPlayback";

describe("Tank media gateway public contract", () => {
  test("builds stable WHEP and HLS endpoints for Cam0", () => {
    const playback = buildPublicCameraPlayback("cam-1786768240090", true, {
      whepBaseUrl: "https://media.tank.unenter.live/webrtc",
      hlsBaseUrl: "https://media.tank.unenter.live/hls",
    });

    expect(cameraMediaPath("cam-1786768240090")).toBe(
      "cameras/cam-1786768240090",
    );
    expect(playback).toEqual({
      status: "ready",
      path: "cameras/cam-1786768240090",
      preferred: "webrtc",
      webrtcPageUrl:
        "https://media.tank.unenter.live/webrtc/cameras/cam-1786768240090/",
      whepUrl:
        "https://media.tank.unenter.live/webrtc/cameras/cam-1786768240090/whep",
      // The AAC sibling path, not the main Opus one — Apple's HLS player
      // cannot decode Opus, so WHEP and HLS deliberately point at different
      // MediaMTX paths. See cameraHlsMediaPath in mediaPlayback.ts.
      hlsUrl:
        "https://media.tank.unenter.live/hls/cameras/cam-1786768240090-hls/index.m3u8",
      audioPolicy: "transcode-required",
    });
  });

  test("returns a secret-free unconfigured contract without public bases", () => {
    const playback = buildPublicCameraPlayback("cam-1786768240090", true, {});
    const serialized = JSON.stringify(playback).toLowerCase();

    expect(playback.status).toBe("unconfigured");
    expect(playback.preferred).toBe("coming-soon");
    expect(serialized).not.toContain("srt://");
    expect(serialized).not.toContain("streamkey");
    expect(serialized).not.toContain("srtauth");
  });
});
