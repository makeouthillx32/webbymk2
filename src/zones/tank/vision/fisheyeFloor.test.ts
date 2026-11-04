import { describe, expect, test } from "bun:test";
import { floorToImage, imageToFloor, parseCameraFits, parseRoomCameraFit, toThreeFloor } from "./fisheyeFloor";

// The living room and kitchen fits as solved by scripts/tank-room-fit.py on
// 2026-11-04. Expected floor points come from the script's own maths
// (pix_to_cam / rot_xyz / ray-floor intersection) run on the same input.
const living = parseRoomCameraFit({
  room: "living-room",
  location: [0.088, 0.251, 2.185],
  rotation_deg: [0, 0, 0],
  fisheye: { f_px: 1, k: 0 },
});

describe("fisheye floor projection (port of tank-room-fit.py)", () => {
  test("matches the Python solve's output", async () => {
    const fits = parseCameraFits({
      rooms: {
        "living-room": JSON.parse(await Bun.file(`${import.meta.dir}/__fixtures__/living-room.result.json`).text()),
        kitchen: JSON.parse(await Bun.file(`${import.meta.dir}/__fixtures__/kitchen.result.json`).text()),
      },
    });
    const golden: Array<[string, number, number, number, number]> = [
      ["living-room", 0.5, 0.9, 1.9446, -0.13],
      ["living-room", 0.3, 0.75, 2.5871, 0.9037],
      ["living-room", 0.8, 0.6, 3.3, -2.6395],
      ["kitchen", 0.5, 0.9, 4.6541, 2.8499],
      ["kitchen", 0.3, 0.75, 4.2843, 1.536],
      ["kitchen", 0.8, 0.6, 2.1852, 4.8474],
    ];
    for (const [room, nx, ny, x, y] of golden) {
      const p = imageToFloor(fits[room], { x: nx, y: ny });
      expect(p).not.toBeNull();
      expect(p!.x).toBeCloseTo(x, 3);
      expect(p!.y).toBeCloseTo(y, 3);
    }
  });

  test("floor -> image -> floor round-trips", async () => {
    const fits = parseCameraFits({
      rooms: { kitchen: JSON.parse(await Bun.file(`${import.meta.dir}/__fixtures__/kitchen.result.json`).text()) },
    });
    const fit = fits.kitchen;
    const floor = imageToFloor(fit, { x: 0.42, y: 0.81 })!;
    const image = floorToImage(fit, floor)!;
    expect(image.x).toBeCloseTo(0.42, 4);
    expect(image.y).toBeCloseTo(0.81, 4);
  });

  test("a ray at or above the horizon never reaches the floor", () => {
    // Identity rotation: the camera looks straight down (-Z), so the centre
    // hits the floor right below it and nothing can be "above" in a 180° view
    // except at the rim. Tilt it level to get a horizon.
    expect(imageToFloor(living!, { x: 0.5, y: 0.5 })).toEqual({ x: 0.088, y: 0.251 });
    const level = parseRoomCameraFit({ room: "x", location: [0, 0, 2], rotation_deg: [90, 0, 0], fisheye: { f_px: 1105, k: 0.1 } })!;
    expect(imageToFloor(level, { x: 0.5, y: 0.2 })).toBeNull(); // above the horizon
    expect(imageToFloor(level, { x: 0.5, y: 0.95 })).not.toBeNull(); // below it
  });

  test("rejects malformed fits; maps house floor to three.js", () => {
    expect(parseRoomCameraFit({ room: "x", location: [0, 0], rotation_deg: [0, 0, 0], fisheye: { f_px: 1, k: 0 } })).toBeNull();
    expect(parseRoomCameraFit({ room: "x", location: [0, 0, -1], rotation_deg: [0, 0, 0], fisheye: { f_px: 1, k: 0 } })).toBeNull();
    expect(parseCameraFits({ rooms: { kitchen: { room: "living-room", location: [0, 0, 2], rotation_deg: [0, 0, 0], fisheye: { f_px: 1, k: 0 } } } })).toEqual({});
    expect(toThreeFloor({ x: 1.5, y: 2 })).toEqual({ x: 1.5, z: -2 });
  });
});
