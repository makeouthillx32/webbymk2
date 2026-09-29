import type { Zone } from "../config/zones.js";
import { recreateCoreService, recreateZoneService } from "./docker.js";
import {
  readStripeLaneSnapshot,
  restoreStripeLaneSnapshot,
  stripeLanesForTarget,
  validateStripeLaneChange,
  writeStripeLaneMode,
  type StripeLane,
  type StripeLaneTarget,
  type StripeMode,
} from "./stripe-lanes.js";

export type StripeLaneApplyOptions = {
  target: StripeLaneTarget;
  mode: StripeMode;
  confirmLive?: boolean;
  apply?: boolean;
  zones: Zone[];
  onLine?: (line: string) => void;
  projectDir?: string;
  applyService?: (lane: StripeLane, zones: Zone[], onLine: (line: string) => void) => Promise<number>;
};

function zoneForLane(zones: Zone[], lane: Exclude<StripeLane, "pos">): Zone | undefined {
  return zones.find((zone) => zone.key.toLowerCase() === lane);
}

async function applyLane(
  lane: StripeLane,
  zones: Zone[],
  onLine: (line: string) => void,
): Promise<number> {
  if (lane === "pos") {
    onLine("Applying POS payment configuration to the core app…");
    return recreateCoreService("app", onLine);
  }

  const zone = zoneForLane(zones, lane);
  if (!zone) {
    onLine(`✗ Cannot apply ${lane}: the zone is not registered in UNAXIS.`);
    return 1;
  }
  onLine(`Applying ${lane} payment configuration to ${zone.label}…`);
  return recreateZoneService(zone, onLine);
}

// Persist first, apply sequentially, and restore every attempted service on failure.
export async function applyStripeLaneMode(options: StripeLaneApplyOptions): Promise<number> {
  const onLine = options.onLine ?? (() => {});
  const snapshot = readStripeLaneSnapshot(options.projectDir);
  const lanes = stripeLanesForTarget(options.target);
  const applyService = options.applyService ?? applyLane;

  try {
    validateStripeLaneChange(snapshot, options.target, options.mode, options.confirmLive === true);
  } catch (error) {
    onLine(`✗ ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  if (options.apply !== false) {
    const missing = lanes.filter((lane) => lane !== "pos" && !zoneForLane(options.zones, lane));
    if (missing.length > 0) {
      onLine(`✗ Cannot apply: missing UNAXIS zone registration for ${missing.join(", ")}.`);
      return 1;
    }
  }

  writeStripeLaneMode(snapshot, options.target, options.mode);
  onLine(`✓ Saved ${lanes.join(", ")} mode=${options.mode} to .env (no credentials printed).`);
  if (options.apply === false) {
    onLine("○ Configuration saved only; running services were not changed.");
    return 0;
  }

  const applied: StripeLane[] = [];
  for (const lane of lanes) {
    const code = await applyService(lane, options.zones, onLine);
    if (code === 0) {
      applied.push(lane);
      continue;
    }

    const rollbackLanes = [lane, ...applied.slice().reverse()];
    onLine(`✗ Apply failed at ${lane}; restoring the previous .env and rolling back ${rollbackLanes.length} attempted service(s).`);
    restoreStripeLaneSnapshot(snapshot);
    let rollbackFailed = false;
    for (const rollbackLane of rollbackLanes) {
      const rollbackCode = await applyService(rollbackLane, options.zones, onLine);
      if (rollbackCode !== 0) rollbackFailed = true;
    }
    onLine(rollbackFailed
      ? "⚠ Previous .env was restored, but one or more service rollbacks failed; inspect the operation log."
      : "✓ Previous .env and already-applied services were restored.");
    return 1;
  }

  onLine(`✓ ${lanes.join(", ")} now ${options.mode}; affected services were recreated sequentially.`);
  return 0;
}
