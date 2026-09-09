import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PROJECT_DIR } from "../config/zones.js";

// Stable order is also the sequential all-lanes apply order.
export const STRIPE_LANES = ["shop", "labs", "pos", "tank"] as const;
export type StripeLane = typeof STRIPE_LANES[number];
export type StripeLaneTarget = StripeLane | "all";
export type StripeMode = "test" | "live";

export type StripeLaneStatus = {
  lane: StripeLane;
  mode: StripeMode;
  serverKey: "missing" | "invalid" | "test" | "live";
  publicKey: "missing" | "invalid" | "test" | "live";
};

export type StripeLaneSnapshot = {
  envPath: string;
  original: string;
  statuses: StripeLaneStatus[];
  testWebhookReady: boolean;
  liveWebhookReady: boolean;
};

function parseEnv(source: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function secretKeyClass(value: string | undefined): StripeLaneStatus["serverKey"] {
  // Classification only: status surfaces must never echo the credential value.
  if (!value) return "missing";
  if (/^(sk|rk)_test_/.test(value)) return "test";
  if (/^(sk|rk)_live_/.test(value)) return "live";
  return "invalid";
}

function publicKeyClass(value: string | undefined): StripeLaneStatus["publicKey"] {
  if (!value) return "missing";
  if (value.startsWith("pk_test_")) return "test";
  if (value.startsWith("pk_live_")) return "live";
  return "invalid";
}

function stripeMode(values: Map<string, string>, lane: StripeLane): StripeMode {
  const explicit = values.get(`STRIPE_${lane.toUpperCase()}_MODE`);
  if (explicit === "live") return "live";
  if (explicit === "test") return "test";
  if (lane !== "tank" && values.get("STRIPE_COMMERCE_MODE") === "live") return "live";
  return "test";
}

function laneKey(
  values: Map<string, string>,
  lane: StripeLane,
  mode: StripeMode,
  kind: "secret" | "public",
): string | undefined {
  const prefix = kind === "secret" ? "STRIPE" : "NEXT_PUBLIC_STRIPE";
  const suffix = kind === "secret" ? "SECRET_KEY" : "PUBLISHABLE_KEY";
  const laneName = `${prefix}_${lane.toUpperCase()}_${mode === "live" ? "LIVE_" : ""}${suffix}`;
  const fallback = `${prefix}_${mode === "live" ? "LIVE_" : ""}${suffix}`;
  return values.get(laneName) || values.get(fallback);
}

function statuses(values: Map<string, string>): StripeLaneStatus[] {
  return STRIPE_LANES.map((lane) => {
    const mode = stripeMode(values, lane);
    return {
      lane,
      mode,
      serverKey: secretKeyClass(laneKey(values, lane, mode, "secret")),
      publicKey: publicKeyClass(laneKey(values, lane, mode, "public")),
    };
  });
}

export function readStripeLaneSnapshot(projectDir = PROJECT_DIR): StripeLaneSnapshot {
  const envPath = join(projectDir, ".env");
  const original = readFileSync(envPath, "utf8");
  const values = parseEnv(original);
  return {
    envPath,
    original,
    statuses: statuses(values),
    testWebhookReady: values.get("STRIPE_WEBHOOK_SECRET")?.startsWith("whsec_") === true,
    liveWebhookReady: values.get("STRIPE_LIVE_WEBHOOK_SECRET")?.startsWith("whsec_") === true,
  };
}

export function stripeLanesForTarget(target: StripeLaneTarget): StripeLane[] {
  return target === "all" ? [...STRIPE_LANES] : [target];
}

export function validateStripeLaneChange(
  snapshot: StripeLaneSnapshot,
  target: StripeLaneTarget,
  mode: StripeMode,
  confirmLive: boolean,
): void {
  if (mode !== "live") return;
  if (!confirmLive) throw new Error("Live mode requires --confirm-live or explicit TUI confirmation.");
  if (!snapshot.liveWebhookReady) throw new Error("STRIPE_LIVE_WEBHOOK_SECRET is missing or invalid.");

  const values = parseEnv(snapshot.original);
  for (const lane of stripeLanesForTarget(target)) {
    if (secretKeyClass(laneKey(values, lane, "live", "secret")) !== "live") {
      throw new Error(`${lane} has no valid live server key.`);
    }
    if (publicKeyClass(laneKey(values, lane, "live", "public")) !== "live") {
      throw new Error(`${lane} has no valid live publishable key.`);
    }
    if (lane === "labs" && values.get("STRIPE_LABS_LIVE_APPROVED") !== "true") {
      throw new Error("Labs live approval is not recorded.");
    }
    if (lane === "tank" && values.get("STRIPE_TANK_LIVE_APPROVED") !== "true") {
      throw new Error("Tank live approval is not recorded.");
    }
  }
}

function setValue(source: string, name: string, value: string): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/).filter((line) => !line.startsWith(`${name}=`));
  const insertAt = lines.length > 0 && lines.at(-1) === "" ? lines.length - 1 : lines.length;
  lines.splice(insertAt, 0, `${name}=${value}`);
  return lines.join(newline);
}

export function writeStripeLaneMode(
  snapshot: StripeLaneSnapshot,
  target: StripeLaneTarget,
  mode: StripeMode,
): StripeLaneSnapshot {
  let updated = snapshot.original;
  for (const lane of stripeLanesForTarget(target)) {
    updated = setValue(updated, `STRIPE_${lane.toUpperCase()}_MODE`, mode);
    updated = setValue(updated, `NEXT_PUBLIC_STRIPE_${lane.toUpperCase()}_MODE`, mode);
  }
  const tempPath = `${snapshot.envPath}.stripe-lanes.tmp`;
  writeFileSync(tempPath, updated, { encoding: "utf8", mode: 0o600 });
  renameSync(tempPath, snapshot.envPath);
  const projectDir = snapshot.envPath.replace(/[\\/]\.env$/, "");
  return readStripeLaneSnapshot(projectDir);
}

export function restoreStripeLaneSnapshot(snapshot: StripeLaneSnapshot): void {
  const tempPath = `${snapshot.envPath}.stripe-lanes.rollback.tmp`;
  writeFileSync(tempPath, snapshot.original, { encoding: "utf8", mode: 0o600 });
  renameSync(tempPath, snapshot.envPath);
}

export function formatStripeLaneStatus(snapshot: StripeLaneSnapshot): string[] {
  const lines = ["Stripe lane status (credentials are never printed):"];
  for (const status of snapshot.statuses) {
    lines.push(
      `  ${status.lane.padEnd(5)} mode=${status.mode.padEnd(4)} server-key=${status.serverKey} public-key=${status.publicKey}`,
    );
  }
  lines.push(`  test-webhook=${snapshot.testWebhookReady ? "ready" : "missing"}`);
  lines.push(`  live-webhook=${snapshot.liveWebhookReady ? "ready" : "missing"}`);
  return lines;
}
