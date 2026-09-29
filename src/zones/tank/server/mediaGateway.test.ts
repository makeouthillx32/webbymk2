import { describe, expect, test } from "bun:test";
import {
  buildDirectorProgramPlayback,
  buildPublicCameraPlayback,
  cameraMediaPath,
} from "../mediaPlayback";
import { buildManagerSrtSource } from "./mediaGateway";

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

  test("builds one stable Director program path independent of camera cuts", () => {
    const playback = buildDirectorProgramPlayback(true, {
      whepBaseUrl: "https://media.tank.unenter.live/webrtc",
      hlsBaseUrl: "https://media.tank.unenter.live/hls",
    });

    expect(playback.path).toBe("obs/director");
    expect(playback.whepUrl).toBe(
      "https://media.tank.unenter.live/webrtc/obs/director-whep/whep",
    );
    expect(playback.hlsUrl).toBe(
      "https://media.tank.unenter.live/hls/obs/director/index.m3u8",
    );
  });

  test("buildManagerSrtSource converts ms to microseconds for ffmpeg libsrt and sets packet protection", () => {
    const wired = buildManagerSrtSource({
      lanHost: "192.168.50.204",
      videoOutPort: 4000,
      streamUser: "cam-1",
      streamKey: "secret123",
      latencyMs: 1000,
    });
    expect(wired).toContain("latency=1000000");
    expect(wired).toContain("rcvlatency=1000000");
    expect(wired).toContain("rcvbuf=67108864");
    expect(wired).toContain("tlpktdrop=0");
    expect(wired).toContain("mode=caller");

    const srtla = buildManagerSrtSource({
      lanHost: "192.168.50.204",
      videoOutPort: 4001,
      streamUser: "cam-phone",
      streamKey: "secret456",
      latencyMs: 4000,
    });
    expect(srtla).toContain("latency=4000000");
    expect(srtla).toContain("rcvlatency=4000000");

    const defaultLatency = buildManagerSrtSource({
      lanHost: "192.168.50.204",
      videoOutPort: 4002,
      streamUser: "cam-default",
      streamKey: "secret789",
    });
    expect(defaultLatency).toContain("latency=2000000");
    expect(defaultLatency).toContain("rcvlatency=2000000");

    expect(buildManagerSrtSource({
      lanHost: "",
      videoOutPort: 4000,
      streamUser: "user",
      streamKey: "key",
    })).toBeNull();
  });
});

