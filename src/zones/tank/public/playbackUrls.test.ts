import { describe, expect, test } from "bun:test";
import { deriveHlsUrl, deriveHlsLowUrl, deriveWhepUrl } from "./playbackUrls";

const B = "https://media.tank.unenter.live";

// Every case below is a URL shape /api/tank/cameras actually hands a player.
describe("deriveHlsLowUrl", () => {
  test("downgrades every cameras/* shape to the 720p rung", () => {
    for (const input of [
      `${B}/cameras/cam-1/whep`,
      `${B}/cameras/cam-1/index.m3u8`,
      `${B}/cameras/cam-1-hls/index.m3u8`,
    ]) {
      expect(deriveHlsLowUrl(input)).toBe(`${B}/cameras/cam-1-hls-low/index.m3u8`);
    }
  });

  // The roster grid passes camera.previewUrl, which is ALREADY the low rung.
  // An earlier guard compared the replaced string to its input and read "no
  // change" as "could not downgrade", so the one caller that was already doing
  // the right thing got silently upgraded back to 4K.
  test("is idempotent on a URL that is already the low rung", () => {
    const low = `${B}/cameras/cam-1-hls-low/index.m3u8`;
    expect(deriveHlsLowUrl(low)).toBe(low);
    expect(deriveHlsLowUrl(deriveHlsLowUrl(low))).toBe(low);
  });

  // previews/* and obs/* publish a single rung. Returning the input unchanged
  // would put a WHEP endpoint on video.src -- MEDIA_ERR_SRC_NOT_SUPPORTED,
  // the black Director/Admin tiles. Never return a non-playlist.
  test("falls back to a playable playlist for single-rung paths", () => {
    expect(deriveHlsLowUrl(`${B}/previews/obs-admin/whep`)).toBe(
      `${B}/previews/obs-admin/index.m3u8`,
    );
    expect(deriveHlsLowUrl(`${B}/obs/admin-whep/whep`)).toBe(`${B}/obs/admin/index.m3u8`);
  });

  test("never returns a WHEP endpoint", () => {
    for (const input of [
      `${B}/cameras/cam-1/whep`,
      `${B}/previews/obs-admin/whep`,
      `${B}/obs/admin-whep/whep`,
    ]) {
      expect(deriveHlsLowUrl(input).endsWith("/whep")).toBe(false);
      expect(deriveHlsLowUrl(input)).toContain(".m3u8");
    }
  });
});

describe("deriveHlsUrl", () => {
  test("adds the -hls sibling for camera paths", () => {
    expect(deriveHlsUrl(`${B}/cameras/cam-1/whep`)).toBe(`${B}/cameras/cam-1-hls/index.m3u8`);
  });

  // The 404 fallback when a rung is absent: strip back to the source path.
  test("direct mode strips any rung suffix back to the ingest path", () => {
    for (const input of [
      `${B}/cameras/cam-1-hls-low/index.m3u8`,
      `${B}/cameras/cam-1-hls/index.m3u8`,
    ]) {
      expect(deriveHlsUrl(input, true)).toBe(`${B}/cameras/cam-1/index.m3u8`);
    }
  });

  test("previews/* resolves to its playlist rather than passing through", () => {
    expect(deriveHlsUrl(`${B}/previews/obs-admin/whep`)).toBe(
      `${B}/previews/obs-admin/index.m3u8`,
    );
  });
});

describe("deriveWhepUrl", () => {
  test("resolves camera paths back to the WHEP endpoint", () => {
    expect(deriveWhepUrl(`${B}/cameras/cam-1-hls/index.m3u8`)).toBe(`${B}/cameras/cam-1/whep`);
  });
});
