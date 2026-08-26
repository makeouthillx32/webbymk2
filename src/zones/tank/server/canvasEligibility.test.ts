import { describe, expect, test } from "bun:test";
import { cameraKindFromProtocol, canvasEligibleCameras, isCanvasEligible } from "./canvasEligibility";

// The canvas scores rooms against each other, which only works if the set of
// rooms is stable. IP cameras hold their tile and show NO SIGNAL when down;
// every other source removes its room entirely. A vanishing tile is
// indistinguishable from a quiet one, so only IP cameras are admitted.

describe("canvas eligibility", () => {
  test("IP cameras are eligible", () => {
    expect(isCanvasEligible({ protocol: "ip-camera" })).toBe(true);
  });

  test("vanishing sources are not", () => {
    for (const p of ["srt", "srtla", "rtmp", "usb"] as const) {
      expect(isCanvasEligible({ protocol: p })).toBe(false);
    }
  });

  test("an unidentifiable camera fails CLOSED", () => {
    // The previous kind-inference defaulted unknown cameras to "ipcam" by
    // sniffing the id. For an exclusion rule that is exactly backwards.
    expect(isCanvasEligible({ protocol: "unknown" })).toBe(false);
    expect(isCanvasEligible({})).toBe(false);
    expect(isCanvasEligible({ protocol: null })).toBe(false);
  });

  test("protocol maps to kind without guessing from the id", () => {
    expect(cameraKindFromProtocol("ip-camera")).toBe("ipcam");
    expect(cameraKindFromProtocol("usb")).toBe("usbcam");
    expect(cameraKindFromProtocol("rtmp")).toBe("obs");
    expect(cameraKindFromProtocol("srt")).toBe("irlcam");
    expect(cameraKindFromProtocol(undefined)).toBe("unknown");
  });

  test("filtering keeps only IP cameras", () => {
    const cams = [
      { id: "a", protocol: "ip-camera" as const },
      { id: "b", protocol: "srt" as const },
      { id: "c", protocol: "ip-camera" as const },
      { id: "d", protocol: "rtmp" as const },
    ];
    expect(canvasEligibleCameras(cams).map((c) => c.id)).toEqual(["a", "c"]);
  });
});
