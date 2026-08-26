import { describe, expect, test } from "bun:test";
import { normalizeManagerCameraMedia } from "./receiverContract";

describe("receiver manager media-scope projection", () => {
  test("preserves Cam0 media scope", () => {
    expect(normalizeManagerCameraMedia({
      id: "cam-1786768240090",
      roomScope: "game-room",
      publicVisible: true,
      audioMode: "embedded",
      tags: ["fixed", "game-room", "DIRECTOR-ELIGIBLE"],
    })).toEqual({
      roomScope: "game-room",
      publicVisible: true,
      audioMode: "embedded",
      audioSourceId: null,
      audioSourceName: null,
      tags: ["fixed", "game-room", "director-eligible"],
    });
  });

  test("preserves the roaming SRTLA contract", () => {
    const media = normalizeManagerCameraMedia({
      id: "remote-cam-1",
      roomScope: "roaming",
      publicVisible: true,
      audioMode: "embedded",
      tags: ["mobile", "director-eligible"],
    });
    expect(media.roomScope).toBe("roaming");
    expect(media.audioMode).toBe("embedded");
    expect(media.publicVisible).toBe(true);
  });

  test("never carries a receiver credential into normalized media metadata", () => {
    const media = normalizeManagerCameraMedia({
      roomScope: "Game Room",
      audioMode: "external",
      audioSourceId: "game-room-mic",
      audioSourceName: "Game Room Mic",
      tags: ["External", "external"],
      streamKey: "must-not-survive-normalization",
    });
    expect(media.audioSourceId).toBe("game-room-mic");
    expect(media.tags).toEqual(["external"]);
    expect(JSON.stringify(media)).not.toContain("must-not-survive-normalization");
  });
});
