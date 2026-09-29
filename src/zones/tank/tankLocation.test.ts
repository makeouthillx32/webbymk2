import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildTankMetadata,
  formatRoomTitle,
  parseTankLocation,
  sanitizeRoomSlug,
  DEFAULT_TANK_METADATA,
} from "./tankLocation";

describe("sanitizeRoomSlug", () => {
  it("sanitizes valid room slugs", () => {
    expect(sanitizeRoomSlug("living-room")).toBe("living-room");
    expect(sanitizeRoomSlug("kitchen")).toBe("kitchen");
    expect(sanitizeRoomSlug("game-room-2")).toBe("game-room-2");
    expect(sanitizeRoomSlug("  FoYeR  ")).toBe("foyer");
  });

  it("safely handles percent-encoded and malformed strings without throwing URIError", () => {
    expect(sanitizeRoomSlug("%25")).toBe(null);
    expect(sanitizeRoomSlug("%")).toBe(null);
    expect(sanitizeRoomSlug("%E0%A4%A")).toBe(null);
    expect(sanitizeRoomSlug("invalid slug with spaces")).toBe(null);
    expect(sanitizeRoomSlug("../traversal")).toBe(null);
    expect(sanitizeRoomSlug("living%2Droom")).toBe("living-room");
    expect(sanitizeRoomSlug(undefined)).toBe(null);
    expect(sanitizeRoomSlug(null)).toBe(null);
  });
});

describe("formatRoomTitle", () => {
  it("formats director and room titles correctly", () => {
    expect(formatRoomTitle("director")).toBe("Director");
    expect(formatRoomTitle("living-room")).toBe("Living Room");
    expect(formatRoomTitle("game-room-2")).toBe("Game Room 2");
  });
});

describe("parseTankLocation", () => {
  it("defaults to director mode in single-URL web app", () => {
    expect(parseTankLocation({})).toEqual({ mode: "director" });
    expect(parseTankLocation({ pathname: "/" })).toEqual({ mode: "director" });
    expect(parseTankLocation({ room: "living-room" })).toEqual({ mode: "director" });
    expect(parseTankLocation({ view: "grid" })).toEqual({ mode: "director" });
  });

  it("verifies single-URL architecture and metadata export in route", () => {
    const route = readFileSync(new URL("../../../zones/tank/src/app/page.tsx", import.meta.url), "utf8");
    expect(route).toContain("export { default, metadata }");
    expect(route).not.toContain("generateMetadata");
  });
});

describe("buildTankMetadata", () => {
  it("returns default director metadata with canonical https://tank.unenter.live/", () => {
    const meta = buildTankMetadata();
    expect(meta.title).toBe("Tank | Live rooms, cameras, and community");
    expect(meta.alternates?.canonical).toBe("https://tank.unenter.live/");
    expect((meta.openGraph as any)?.url).toBe("https://tank.unenter.live/");
  });

  it("canonical URL is strictly https://tank.unenter.live/ for all states", () => {
    const roomMeta = buildTankMetadata({ mode: "room", slug: "kitchen" });
    expect(roomMeta.alternates?.canonical).toBe("https://tank.unenter.live/");

    const gridMeta = buildTankMetadata({ mode: "grid" });
    expect(gridMeta.alternates?.canonical).toBe("https://tank.unenter.live/");
  });
});
