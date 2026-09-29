"use server";

// Tank Tavern — admin/moderator management: config, chit templates, SFX
// curation, and the tank_tavern_enabled kill switch. Gated with the
// canonical requireStaff() (role lives in auth app_metadata, not a table
// column — see staffAuth.ts's own header comment for why that distinction
// matters). Enabling the feature is deliberately admin-only, not moderator —
// it's the Phase 5 rollout switch, not routine day-to-day config.

import { createAdminClient } from "@/utils/supabase/admin";
import { requireStaff } from "./staffAuth";

export type TavernConfig = {
  shiftMinutes: number;
  chitIntervalMinSec: number;
  chitIntervalMaxSec: number;
  maxPendingChits: number;
  chitExpirySec: number;
  mutinyThresholdPct: number;
  mutinyVoteSec: number;
  clickBonusPct: number;
  sfxAllowancePerShift: number;
  sfxCooldownSec: number;
  takeoverShieldSec: number;
};

export type TavernChitTemplate = {
  id: string;
  weight: number;
  dialogue: string;
  troubleType: string | null;
  payload: Record<string, unknown>;
  tipTokens: number;
  isActive: boolean;
};

export type TavernAdminSfxOption = { id: string; soundKey: string; name: string; tavernEnabled: boolean };

export type TavernAdminState = {
  enabled: boolean;
  config: TavernConfig | null;
  templates: TavernChitTemplate[];
  sfx: TavernAdminSfxOption[];
};

function rowToConfig(row: any): TavernConfig {
  return {
    shiftMinutes: row.shift_minutes,
    chitIntervalMinSec: row.chit_interval_min_sec,
    chitIntervalMaxSec: row.chit_interval_max_sec,
    maxPendingChits: row.max_pending_chits,
    chitExpirySec: row.chit_expiry_sec,
    mutinyThresholdPct: row.mutiny_threshold_pct,
    mutinyVoteSec: row.mutiny_vote_sec,
    clickBonusPct: row.click_bonus_pct,
    sfxAllowancePerShift: row.sfx_allowance_per_shift,
    sfxCooldownSec: row.sfx_cooldown_sec,
    takeoverShieldSec: row.takeover_shield_sec,
  };
}

function rowToTemplate(row: any): TavernChitTemplate {
  return {
    id: row.id,
    weight: row.weight,
    dialogue: row.dialogue,
    troubleType: row.trouble_type,
    payload: row.payload ?? {},
    tipTokens: row.tip_tokens,
    isActive: row.is_active,
  };
}

export async function getTavernAdminStateAction(): Promise<TavernAdminState | { error: string }> {
  const staff = await requireStaff();
  if (!staff) return { error: "Staff only." };

  const admin = createAdminClient();
  const [{ data: settingRow }, { data: configRow }, { data: templateRows }, { data: sfxRows }] = await Promise.all([
    admin.from("tank_platform_settings").select("value").eq("key", "tank_tavern_enabled").maybeSingle(),
    admin.from("tank_tavern_config").select("*").limit(1).maybeSingle(),
    admin.from("tank_tavern_chit_templates").select("*").order("weight", { ascending: false }),
    admin.from("tank_sfx_library").select("id, sound_key, name, tavern_enabled").eq("is_active", true).order("name", { ascending: true }),
  ]);

  return {
    enabled: (settingRow?.value as { enabled?: boolean } | null)?.enabled === true,
    config: configRow ? rowToConfig(configRow) : null,
    templates: (templateRows ?? []).map(rowToTemplate),
    sfx: (sfxRows ?? []).map((r) => ({ id: r.id, soundKey: r.sound_key, name: r.name, tavernEnabled: r.tavern_enabled })),
  };
}

export async function setTavernEnabledAction(enabled: boolean): Promise<{ success: boolean; error?: string }> {
  const staff = await requireStaff();
  if (!staff || staff.role !== "admin") return { success: false, error: "Admin only." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("tank_platform_settings")
    .upsert({ key: "tank_tavern_enabled", value: { enabled } }, { onConflict: "key" });
  return error ? { success: false, error: error.message } : { success: true };
}

export async function updateTavernConfigAction(
  patch: Partial<TavernConfig>,
): Promise<{ success: boolean; error?: string }> {
  const staff = await requireStaff();
  if (!staff) return { success: false, error: "Staff only." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("tank_tavern_config").select("id").limit(1).maybeSingle();
  if (!existing) return { success: false, error: "Config row missing." };

  const columnMap: Record<string, string> = {
    shiftMinutes: "shift_minutes",
    chitIntervalMinSec: "chit_interval_min_sec",
    chitIntervalMaxSec: "chit_interval_max_sec",
    maxPendingChits: "max_pending_chits",
    chitExpirySec: "chit_expiry_sec",
    mutinyThresholdPct: "mutiny_threshold_pct",
    mutinyVoteSec: "mutiny_vote_sec",
    clickBonusPct: "click_bonus_pct",
    sfxAllowancePerShift: "sfx_allowance_per_shift",
    sfxCooldownSec: "sfx_cooldown_sec",
    takeoverShieldSec: "takeover_shield_sec",
  };
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(patch)) {
    const column = columnMap[key];
    if (column && typeof value === "number" && Number.isFinite(value)) dbPatch[column] = value;
  }

  const { error } = await admin.from("tank_tavern_config").update(dbPatch).eq("id", existing.id);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function createChitTemplateAction(input: {
  weight: number;
  dialogue: string;
  troubleType?: string | null;
  payload?: Record<string, unknown>;
  tipTokens: number;
}): Promise<{ success: boolean; error?: string }> {
  const staff = await requireStaff();
  if (!staff) return { success: false, error: "Staff only." };
  if (!input.dialogue.trim()) return { success: false, error: "Dialogue is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("tank_tavern_chit_templates").insert({
    weight: Math.max(1, Math.round(input.weight)),
    dialogue: input.dialogue.trim(),
    trouble_type: input.troubleType?.trim() || null,
    payload: input.payload ?? {},
    tip_tokens: Math.max(0, Math.round(input.tipTokens)),
  });
  return error ? { success: false, error: error.message } : { success: true };
}

export async function setChitTemplateActiveAction(
  templateId: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  const staff = await requireStaff();
  if (!staff) return { success: false, error: "Staff only." };
  const admin = createAdminClient();
  const { error } = await admin.from("tank_tavern_chit_templates").update({ is_active: isActive }).eq("id", templateId);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function deleteChitTemplateAction(templateId: string): Promise<{ success: boolean; error?: string }> {
  const staff = await requireStaff();
  if (!staff) return { success: false, error: "Staff only." };
  const admin = createAdminClient();
  const { error } = await admin.from("tank_tavern_chit_templates").delete().eq("id", templateId);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function setSfxTavernEnabledAction(
  sfxId: string,
  tavernEnabled: boolean,
): Promise<{ success: boolean; error?: string }> {
  const staff = await requireStaff();
  if (!staff) return { success: false, error: "Staff only." };
  const admin = createAdminClient();
  const { error } = await admin.from("tank_sfx_library").update({ tavern_enabled: tavernEnabled }).eq("id", sfxId);
  return error ? { success: false, error: error.message } : { success: true };
}
