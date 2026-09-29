"use server";

// Tank Tavern — public snapshot + broadcast helper.
//
// Realtime split: JS-side mutating actions (chit resolve, mutiny start/vote,
// Apron Snatcher use) call broadcastTavernEvent() right after they commit,
// for instant feedback — same "room:<x>:chat"-style Broadcast pattern used
// everywhere else in Tank (see pollSystem.ts). private.tank_tavern_tick()
// runs inside Postgres on a 10s pg_cron schedule and has no way to emit a
// Supabase Realtime broadcast itself (no JS runtime, and wiring pg_net to
// call a webhook on every tick is real added complexity this feature
// doesn't need yet) — tick()-only changes (a new chit appearing, a shift
// rotating/being promoted, a mutiny auto-closing at its deadline) reach
// clients via TavernPanel polling getTavernSnapshotAction() on a short
// interval instead. Worth revisiting only if that polling cadence ever
// becomes a real cost or latency problem.

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { TavernChit, TavernMutiny, TavernShift, TavernSnapshot } from "../tavernTypes";

export async function broadcastTavernEvent(event: string, payload: Record<string, unknown>): Promise<void> {
  const admin = createAdminClient();
  const channel = admin.channel("tank:tavern:state");
  await channel.send({ type: "broadcast", event, payload });
  await admin.removeChannel(channel);
}

function rowToShift(row: any, bartenderName: string): TavernShift {
  return {
    id: row.id,
    bartenderId: row.bartender_id,
    bartenderName,
    bartenderClickId: row.bartender_click_id,
    clickBonusApplies: row.click_bonus_applies,
    startedAt: row.started_at,
    deadlineAt: row.deadline_at,
    chaos: row.chaos,
    sfxAllowanceRemaining: row.sfx_allowance_remaining,
    tipsTokens: row.tips_tokens,
    status: row.status,
    takeoverShieldedUntil: row.takeover_shielded_until,
  };
}

function rowToChit(row: any): TavernChit {
  return {
    id: row.id,
    shiftId: row.shift_id,
    dialogue: row.dialogue_snapshot,
    payload: row.payload_snapshot ?? {},
    troubleType: row.trouble_type ?? null,
    createdAt: row.created_at,
    deadlineAt: row.deadline_at,
    outcome: row.outcome,
  };
}

function rowToMutiny(row: any, myVote: "overturn" | "defend" | null | undefined): TavernMutiny {
  return {
    id: row.id,
    shiftId: row.shift_id,
    startedAt: row.started_at,
    voteDeadlineAt: row.vote_deadline_at,
    status: row.status,
    eligibleCount: row.eligible_count,
    overturnCount: row.overturn_count,
    defendCount: row.defend_count,
    myVote,
  };
}

export async function getTavernSnapshotAction(): Promise<TavernSnapshot> {
  const admin = createAdminClient();

  const { data: settingRow } = await admin
    .from("tank_platform_settings")
    .select("value")
    .eq("key", "tank_tavern_enabled")
    .maybeSingle();
  const enabled = (settingRow?.value as { enabled?: boolean } | null)?.enabled === true;
  if (!enabled) return { enabled: false, shift: null, chits: [], mutiny: null, queueLength: 0, sfxOptions: [] };

  const { data: sfxRows } = await admin
    .from("tank_sfx_library")
    .select("sound_key, name")
    .eq("is_active", true)
    .eq("tavern_enabled", true)
    .order("name", { ascending: true });
  const sfxOptions = (sfxRows ?? []).map((r) => ({ soundKey: r.sound_key, name: r.name }));

  const { data: shiftRow } = await admin.from("tank_tavern_shifts").select("*").eq("status", "active").maybeSingle();

  const { count: queueCount } = await admin.from("tank_tavern_queue").select("*", { count: "exact", head: true });

  if (!shiftRow) {
    return { enabled: true, shift: null, chits: [], mutiny: null, queueLength: queueCount ?? 0, sfxOptions };
  }

  const { data: bartenderProfile } = await admin
    .from("tank_profiles")
    .select("display_name")
    .eq("user_id", shiftRow.bartender_id)
    .maybeSingle();
  const shift = rowToShift(shiftRow, bartenderProfile?.display_name ?? "A viewer");

  const { data: chitRows } = await admin
    .from("tank_tavern_chits")
    .select("*, tank_tavern_chit_templates(trouble_type)")
    .eq("shift_id", shiftRow.id)
    .eq("outcome", "pending")
    .order("created_at", { ascending: true });
  const chits = (chitRows ?? []).map((row: any) =>
    rowToChit({ ...row, trouble_type: row.tank_tavern_chit_templates?.trouble_type ?? null }),
  );

  const { data: mutinyRow } = await admin
    .from("tank_tavern_mutinies")
    .select("*")
    .eq("shift_id", shiftRow.id)
    .eq("status", "open")
    .maybeSingle();

  let mutiny: TavernMutiny | null = null;
  if (mutinyRow) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let myVote: "overturn" | "defend" | null = null;
    if (user) {
      const { data: voteRow } = await admin
        .from("tank_tavern_mutiny_votes")
        .select("choice")
        .eq("mutiny_id", mutinyRow.id)
        .eq("user_id", user.id)
        .maybeSingle();
      myVote = (voteRow?.choice as "overturn" | "defend" | undefined) ?? null;
    }
    mutiny = rowToMutiny(mutinyRow, myVote);
  }

  return { enabled: true, shift, chits, mutiny, queueLength: queueCount ?? 0, sfxOptions };
}
