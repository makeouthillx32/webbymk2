import { expect, test } from "bun:test";
import { mediaMtxConfigEqual } from "./mediaMtxConfigEqual";

test("canonical durations do not cause recorder reconfiguration", () => {
  expect(mediaMtxConfigEqual({ recordSegmentDuration: "9m15s", recordDeleteAfter: "2h0m0s" }, { recordSegmentDuration: "555s", recordDeleteAfter: "2h" })).toBe(true);
});
test("real duration or worker changes still apply", () => {
  expect(mediaMtxConfigEqual({ recordSegmentDuration: "9m15s" }, { recordSegmentDuration: "570s" })).toBe(false);
  expect(mediaMtxConfigEqual({ runOnInit: "old" }, { runOnInit: "new" })).toBe(false);
  expect(mediaMtxConfigEqual({ recordDeleteAfter: "invalid" }, { recordDeleteAfter: "2h" })).toBe(false);
});
