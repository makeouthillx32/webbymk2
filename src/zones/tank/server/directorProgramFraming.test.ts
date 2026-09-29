import { beforeEach, describe, expect, test } from "bun:test";
import {
  getDirectorProgramFraming,
  PROGRAM_FRAMING_TTL_MS,
  resetDirectorProgramFramingForTests,
  sanitizeProgramPtzState,
  setDirectorProgramFraming,
} from "./directorProgramFraming";

describe("Director programme framing lease", () => {
  beforeEach(() => resetDirectorProgramFramingForTests());

  test("carries an automatic AI crop for the matching programme camera", () => {
    setDirectorProgramFraming(
      "cam-game",
      "game-room",
      { zoomFactor: 3.47, panOffsetX: 1200, panOffsetY: 500, zoomSpeed: 5, speedMode: "fine" },
      1_000,
    );
    expect(getDirectorProgramFraming("cam-game", 1_500)?.ptzState).toMatchObject({
      zoomFactor: 3.47,
      panOffsetX: 1200,
      panOffsetY: 500,
    });
    expect(getDirectorProgramFraming("cam-kitchen", 1_500)).toBeNull();
  });

  test("expires instead of freezing an abandoned moving-subject crop", () => {
    setDirectorProgramFraming("cam-game", "game-room", { zoomFactor: 2 }, 1_000);
    expect(getDirectorProgramFraming("cam-game", 1_000 + PROGRAM_FRAMING_TTL_MS)).not.toBeNull();
    expect(getDirectorProgramFraming("cam-game", 1_001 + PROGRAM_FRAMING_TTL_MS)).toBeNull();
  });

  test("sanitizes corrupt and off-frame framing", () => {
    expect(
      sanitizeProgramPtzState({
        zoomFactor: 99,
        panOffsetX: 99_999,
        panOffsetY: -50,
        zoomSpeed: Number.NaN,
        speedMode: "turbo",
      }),
    ).toEqual({
      zoomFactor: 3.5,
      panOffsetX: 3840 - 3840 / 3.5,
      panOffsetY: 0,
      zoomSpeed: 5,
      speedMode: "fine",
    });
  });
});
