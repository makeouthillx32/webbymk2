// src/ink/zone/route-classifier.ts
// ─────────────────────────────────────────────────────────────────────────────
// Zone-overrides.ts data operations.
//
// Scaffold adds one line to ZONE_LAYOUTS in zone-overrides.ts.
// Delete removes that line. Neither operation touches routeClassifier.ts
// source code — that file stays human-readable with no zone-key literals.
//
// Format written per zone:
//   {key}: { layoutType: "{type}", appFooter: "{footer}" },
//
// The closing `};` line is used as the insertion anchor for adds.
// The key: prefix is used to locate the line for removes.
// ─────────────────────────────────────────────────────────────────────────────

import { join }                        from "path";
import { existsSync, readFileSync }    from "fs";
import { PROJECT_DIR }                 from "../../config/stack.ts";
import { writeFileAtomic }             from "../../utils/zoneScaffolding.ts";
import type { DerivedZone, OnLine }    from "./types.ts";

const OVERRIDES_PATH = join(
  PROJECT_DIR, "src", "components", "Layouts", "zone-overrides.ts"
);

// ── Add zone to zone-overrides.ts ─────────────────────────────────────────────

export async function patchRouteClassifier(z: DerivedZone, onLine: OnLine): Promise<void> {
  if (!existsSync(OVERRIDES_PATH)) {
    onLine(`⚠ zone-overrides.ts not found — skipping layout registration`);
    return;
  }

  const content = readFileSync(OVERRIDES_PATH, "utf-8").replace(/\r\n/g, "\n");

  // Guard: already registered
  if (content.includes(`  ${z.key}:`)) {
    onLine(`⚠ zone-overrides.ts already has an entry for "${z.key}" — skipping`);
    return;
  }

  // Find the closing `};` of ZONE_LAYOUTS and insert the new entry before it.
  const anchor = "\n};";
  const anchorIdx = content.lastIndexOf(anchor);
  if (anchorIdx === -1) {
    onLine(`⚠ Could not locate ZONE_LAYOUTS closing brace in zone-overrides.ts — skipping`);
    return;
  }

  const padding = " ".repeat(Math.max(1, 9 - z.key.length));
  const entry   = `  ${z.key}:${padding}{ layoutType: "${z.layoutType}", appFooter: "${z.appFooter}" },\n`;
  const newContent = content.slice(0, anchorIdx + 1) + entry + content.slice(anchorIdx + 1);

  await writeFileAtomic(OVERRIDES_PATH, newContent);
  onLine(`✓ Registered "${z.key}" in zone-overrides.ts  (${z.layoutType}${z.layoutType === "app" ? `, footer: ${z.appFooter}` : ""})`);
}

// ── Remove zone from zone-overrides.ts ───────────────────────────────────────

export async function removeFromRouteClassifier(key: string, onLine: OnLine): Promise<void> {
  if (!existsSync(OVERRIDES_PATH)) {
    onLine(`⚠ zone-overrides.ts not found — skipping`);
    return;
  }

  const content = readFileSync(OVERRIDES_PATH, "utf-8").replace(/\r\n/g, "\n");

  if (!content.includes(`  ${key}:`)) {
    onLine(`⚠ No entry for "${key}" in zone-overrides.ts — skipping`);
    return;
  }

  // Remove the line that starts with "  {key}:".
  // Each entry occupies exactly one line in the format written above, so a
  // simple line-filter is safe — no brace-counting needed.
  const lines    = content.split("\n");
  const filtered = lines.filter((line) => !line.trimStart().startsWith(`${key}:`));

  if (filtered.length === lines.length) {
    onLine(`⚠ Could not locate entry for "${key}" in zone-overrides.ts — remove it manually`);
    return;
  }

  await writeFileAtomic(OVERRIDES_PATH, filtered.join("\n"));
  onLine(`✓ Removed "${key}" from zone-overrides.ts`);
}
