// src/zones/tank/server/overlayFxStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// The server half of chaos items: deciding whether an overlay fx may fire,
// recording it, and pushing it to the running overlays.
//
// THREE GATES, in order, each cheap:
//
//   1. The House Console kill-switch (tank_platform_settings key
//      "overlay_fx_enabled"). Off means the item is consumed as a normal item
//      and nothing happens to the overlays — the operator's switch is the
//      final authority, not a suggestion.
//   2. A per-user cooldown (tank_platform_settings key "overlay_fx_cooldowns",
//      same shape as the flex cooldowns) so one viewer cannot hold the
//      overlays hostage by re-skinning them every message.
//   3. The item's own metadata. No overlayFx, no fx — a normal item use
//      must never touch overlay state.
//
// The fx itself is written as the "fx" row of tank_overlay_settings — the
// table the overlays already read on mount and subscribe to — so the
// transport is the existing fetch + broadcast, and an overlay started mid-fx
// picks it up on load. The row carries its own expiry; see obs/overlayFx.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/utils/supabase/admin";
import { saveOverlaySettings } from "./overlaySettingsStore";

export const OVERLAY_FX_ENABLED_KEY = "overlay_fx_enabled";
const OVERLAY_FX_COOLDOWNS_KEY = "overlay_fx_cooldowns";
const OVERLAY_FX_COOLDOWN_MS = 30_000;

export type OverlayFxOutcome =
  | { fired: true; expiresAt: number }
  | { fired: false; reason: "disabled" | "cooldown" };

async function readPlatformSetting<T>(key: string): Promise<T | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tank_platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T | undefined) ?? null;
}

/** The House Console kill-switch. Absent means ON — same convention as the overlay visibility flags. */
export async function isOverlayFxEnabled(): Promise<boolean> {
  const value = await readPlatformSetting<boolean>(OVERLAY_FX_ENABLED_KEY);
  return value !== false;
}

/**
 * Attempt to fire an overlay fx. Returns whether it fired; the caller decides
 * what the item use means when it did not (consume anyway, message anyway).
 */
export async function tryFireOverlayFx(params: {
  userId: string;
  triggeredBy: string;
  texture: "aluminum" | "metal" | "plate";
  durationSec: number;
}): Promise<OverlayFxOutcome> {
  const admin = createAdminClient();

  // Gate 1: the operator's switch.
  if (!(await isOverlayFxEnabled())) {
    return { fired: false, reason: "disabled" };
  }

  // Gate 2: per-user cooldown. Read-modify-write against a single settings
  // row, same pattern as the flex cooldowns — a lost update costs one
  // extra fx, which is fine.
  const { data: cooldownRow } = await admin
    .from("tank_platform_settings")
    .select("value")
    .eq("key", OVERLAY_FX_COOLDOWNS_KEY)
    .maybeSingle();
  const cooldowns = (cooldownRow?.value as Record<string, number> | null) ?? {};
  const last = cooldowns[params.userId] ?? 0;
  if (Date.now() - last < OVERLAY_FX_COOLDOWN_MS) {
    return { fired: false, reason: "cooldown" };
  }

  // Record the cooldown and the fx itself. The fx row's expiry is the
  // client's authority to stop honouring it, so no cleanup job exists.
  const expiresAt = Date.now() + params.durationSec * 1000;
  try {
    await admin.from("tank_platform_settings").upsert(
      {
        key: OVERLAY_FX_COOLDOWNS_KEY,
        value: { ...cooldowns, [params.userId]: Date.now() },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

    // The "fx" overlay id is not an editor-visible overlay, so this goes
    // straight through saveOverlaySettings (which sanitizes and broadcasts)
    // rather than the staff-only POST route.
    await saveOverlaySettings("fx", {
      texture: params.texture,
      expiresAt,
      triggeredBy: params.triggeredBy,
    }, null);
  } catch (err) {
    console.error("[OverlayFx] write failed:", err);
    return { fired: false, reason: "disabled" };
  }

  return { fired: true, expiresAt };
}

/** The House Console kill-switch setter. */
export async function setOverlayFxEnabled(enabled: boolean): Promise<void> {
  const admin = createAdminClient();
  await admin.from("tank_platform_settings").upsert(
    {
      key: OVERLAY_FX_ENABLED_KEY,
      value: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
}
