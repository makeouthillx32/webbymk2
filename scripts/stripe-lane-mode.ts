import {
  formatStripeLaneStatus,
  readStripeLaneSnapshot,
  type StripeLaneTarget,
  type StripeMode,
} from "../src/ink/stripe-lanes";
import { applyStripeLaneMode } from "../src/ink/stripe-lane-apply";
import { loadZones } from "../src/ink/zone-store";

function usage(): never {
  console.error("Usage: bun run stripe:lanes status");
  console.error("       bun run stripe:lanes set <shop|labs|pos|tank|all> <test|live> [--confirm-live] [--config-only]");
  process.exit(2);
}

const [command = "status", rawTarget, rawMode, ...flags] = process.argv.slice(2);
const snapshot = readStripeLaneSnapshot();

if (command === "status") {
  for (const line of formatStripeLaneStatus(snapshot)) console.log(line);
  process.exit(0);
}
if (command !== "set" || !rawTarget || !rawMode) usage();

const target = rawTarget as StripeLaneTarget;
const mode = rawMode as StripeMode;
if (!["shop", "labs", "pos", "tank", "all"].includes(target)) usage();
if (mode !== "test" && mode !== "live") usage();

const code = await applyStripeLaneMode({
  target,
  mode,
  confirmLive: flags.includes("--confirm-live"),
  apply: !flags.includes("--config-only"),
  zones: await loadZones(true),
  onLine: console.log,
});
if (code === 0) {
  for (const line of formatStripeLaneStatus(readStripeLaneSnapshot())) console.log(line);
}
process.exit(code);
