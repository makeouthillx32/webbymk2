// src/zones/tank/server/overlaySettingsStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reading and writing tank_overlay_settings.
//
// The point of this table is that an OBS browser source URL is pasted ONCE and
// everything about it is changed from the console afterwards. Two consequences
// shape this module:
//
//  1. Reads are PUBLIC. A browser source has no session and cannot be given
//     one, so the read path must work unauthenticated. Everything in here is
//     cosmetic — caption text, toggles, effect timings.
//  2. Writes broadcast. The overlays already hold a realtime subscription for
//     director state, so a saved change is pushed to every running source and
//     applies with no reload. Without that, "configure from the console" would
//     still mean walking over to OBS.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/utils/supabase/admin";
import { sanitizeSettings, type OverlaySettings } from "../obs/overlaySettings";

/** Realtime channel the overlays listen on. */
export const OVERLAY_SETTINGS_CHANNEL = "tank:overlay:settings";
export const OVERLAY_SETTINGS_EVENT = "overlay_settings_changed";

export type OverlaySettingsMap = Record<string, OverlaySettings>;

export async function readAllOverlaySettings(): Promise<OverlaySettingsMap> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_overlay_settings")
    .select("overlay_id, settings");

  // A failed read must NOT take the overlays down. They fall back to their
  // built-in defaults, which is the behaviour they had before this table
  // existed — degraded, but on air.
  if (error) {
    console.warn(`[TankOverlaySettings] read failed: ${error.message}`);
    return {};
  }

  const map: OverlaySettingsMap = {};
  for (const row of (data ?? []) as Array<{ overlay_id: string; settings: unknown }>) {
    if (!row.overlay_id) continue;
    map[row.overlay_id] = sanitizeSettings(row.settings);
  }
  return map;
}

export type SaveResult = { ok: true; settings: OverlaySettings } | { ok: false; error: string };

export async function saveOverlaySettings(
  overlayId: string,
  settings: unknown,
  updatedBy: string | null,
): Promise<SaveResult> {
  const clean = sanitizeSettings(settings);
  const admin = createAdminClient();

  const { error } = await admin
    .from("tank_overlay_settings")
    .upsert(
      {
        overlay_id: overlayId,
        settings: clean,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "overlay_id" },
    );

  if (error) return { ok: false, error: error.message };

  // Push to every running browser source. Best effort on purpose: the write is
  // already durable, so a broadcast failure costs a reload, not the setting.
  try {
    const channel = admin.channel(OVERLAY_SETTINGS_CHANNEL);
    const sent = await channel.send({
      type: "broadcast",
      event: OVERLAY_SETTINGS_EVENT,
      payload: { overlayId, settings: clean },
    });
    if (sent !== "ok") {
      console.warn(`[TankOverlaySettings] broadcast did not confirm: ${sent}`);
    }
  } catch (error) {
    console.warn(
      `[TankOverlaySettings] broadcast threw: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { ok: true, settings: clean };
}
