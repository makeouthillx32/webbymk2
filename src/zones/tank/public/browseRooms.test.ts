import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DerivedRoom } from "../contracts";
import { rooms as fixtureRooms } from "../fixtures";
import { buildBrowseRooms } from "./browseRooms";

function liveRoom(roomKey: string, overrides: Partial<DerivedRoom> = {}): DerivedRoom {
  return {
    roomKey,
    title: "",
    eyebrow: "",
    description: "",
    tags: [],
    visibilityPolicy: "always-show",
    cameraIds: [`cam-${roomKey}`],
    featuredCameraId: `cam-${roomKey}`,
    anyOnline: true,
    audioOutputKind: "embedded",
    audioOutputConfig: {},
    audioInputSourceId: null,
    ...overrides,
  };
}

describe("buildBrowseRooms", () => {
  test("a switched-off room stays gone — fixtures do not put it back", () => {
    // Kitchen switched off: deriveRooms omits it from the snapshot.
    const rooms = buildBrowseRooms(fixtureRooms, {
      source: "receiver-manager",
      rooms: [liveRoom("game-room"), liveRoom("living-room")],
    });
    expect(rooms.map((room) => room.roomKey)).toEqual(["game-room", "living-room"]);
  });

  test("all rooms off is an empty list, so the calm all-off message can show", () => {
    expect(buildBrowseRooms(fixtureRooms, { source: "receiver-manager", rooms: [] })).toEqual([]);
  });

  test("fixtures still curate titles and descriptions of live rooms", () => {
    const [kitchen] = buildBrowseRooms(fixtureRooms, {
      source: "receiver-manager",
      rooms: [liveRoom("kitchen")],
    });
    expect(kitchen.title).toBe("Kitchen");
    expect(kitchen.description).toBe("The kitchen camera feed.");
    expect(kitchen.live).toBe(true);
  });

  test("fails open to the house rooms with no snapshot or no receiver", () => {
    const expected = fixtureRooms.filter((room) => room.slug !== "director").length;
    expect(buildBrowseRooms(fixtureRooms, null)).toHaveLength(expected);
    expect(buildBrowseRooms(fixtureRooms, { source: "unavailable", rooms: [] })).toHaveLength(expected);
  });

  test("director is never a browse room", () => {
    const rooms = buildBrowseRooms(fixtureRooms, {
      source: "receiver-manager",
      rooms: [liveRoom("director"), liveRoom("foyer")],
    });
    expect(rooms.map((room) => room.roomKey)).toEqual(["foyer"]);
  });
});

describe("viewer-facing room copy", () => {
  test("never tells viewers about the operator's camera tooling", () => {
    const source = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");
    expect(source).not.toContain("SRT app");
    expect(source).not.toContain("not connected");
    expect(source).not.toContain("WebRTC low-latency stream player");
    expect(source).not.toContain("Director Room Negotiator");
    expect(source).toContain("is off air");
  });
});
