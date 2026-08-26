"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export type OverlayTriggerType = "cron" | "action" | "message_count" | "keyword";
export type OverlayTriggerScope = "global" | "room";

export type OverlayTrigger = {
  id: string;
  sceneId: string;
  triggerType: OverlayTriggerType;
  actionKey: string | null;
  cronExpression: string | null;
  scope: OverlayTriggerScope;
  roomKey: string | null;
  keywordPattern: string | null;
  messageCountThreshold: number | null;
  progressCount: number;
  message: string;
  enabled: boolean;
  lastFiredAt: string | null;
};

export type OverlayScene = {
  id: string;
  slug: string;
  name: string;
  soundKey: string | null;
  displaySeconds: number;
  createdAt: string;
  triggers: OverlayTrigger[];
};

export type OverlayActionResult = { success: boolean; error?: string };

async function requireStaff(): Promise<{ userId: string; role: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profile?.role || "user";
  if (role !== "admin" && role !== "moderator") return { error: "Staff only." };
  return { userId: user.id, role };
}

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const staff = await requireStaff();
  if ("error" in staff) return staff;
  if (staff.role !== "admin") return { error: "Admin only." };
  return { userId: staff.userId };
}

function mapTrigger(row: any): OverlayTrigger {
  return {
    id: row.id,
    sceneId: row.scene_id,
    triggerType: row.trigger_type,
    actionKey: row.action_key,
    cronExpression: row.cron_expression,
    scope: row.scope,
    roomKey: row.room_key,
    keywordPattern: row.keyword_pattern,
    messageCountThreshold: row.message_count_threshold,
    progressCount: row.progress_count ?? 0,
    message: row.message,
    enabled: row.enabled,
    lastFiredAt: row.last_fired_at,
  };
}

const TRIGGER_SELECT_COLUMNS =
  "id, scene_id, trigger_type, action_key, cron_expression, scope, room_key, keyword_pattern, message_count_threshold, progress_count, message, enabled, last_fired_at";

export async function listOverlayScenes(): Promise<OverlayScene[]> {
  const staff = await requireStaff();
  if ("error" in staff) return [];

  const admin = createAdminClient();
  const { data: scenes, error } = await admin
    .from("tank_overlay_scenes")
    .select("id, slug, name, sound_key, display_seconds, created_at")
    .order("created_at", { ascending: false });
  if (error || !scenes) return [];

  const { data: triggers } = await admin
    .from("tank_overlay_triggers")
    .select(TRIGGER_SELECT_COLUMNS)
    .order("created_at", { ascending: true });

  const triggersBySceneId = new Map<string, OverlayTrigger[]>();
  for (const row of triggers ?? []) {
    const list = triggersBySceneId.get(row.scene_id) ?? [];
    list.push(mapTrigger(row));
    triggersBySceneId.set(row.scene_id, list);
  }

  return scenes.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    soundKey: s.sound_key,
    displaySeconds: s.display_seconds,
    createdAt: s.created_at,
    triggers: triggersBySceneId.get(s.id) ?? [],
  }));
}

export async function createOverlayScene(input: {
  slug: string;
  name: string;
  soundKey?: string | null;
  displaySeconds?: number;
}): Promise<OverlayActionResult & { sceneId?: string }> {
  const admin_check = await requireAdmin();
  if ("error" in admin_check) return { success: false, error: admin_check.error };

  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  if (!slug) return { success: false, error: "Slug is required." };
  if (!input.name.trim()) return { success: false, error: "Name is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_overlay_scenes")
    .insert({
      slug,
      name: input.name.trim(),
      sound_key: input.soundKey?.trim() || null,
      display_seconds: input.displaySeconds ?? 6,
      created_by: admin_check.userId,
    })
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Failed to create scene." };
  return { success: true, sceneId: data.id };
}

export async function deleteOverlayScene(sceneId: string): Promise<OverlayActionResult> {
  const admin_check = await requireAdmin();
  if ("error" in admin_check) return { success: false, error: admin_check.error };

  const admin = createAdminClient();
  const { data: triggers } = await admin
    .from("tank_overlay_triggers")
    .select("id, cron_job_name")
    .eq("scene_id", sceneId);

  for (const t of triggers ?? []) {
    if (t.cron_job_name) {
      await admin.rpc("tank_unschedule_overlay_trigger", { p_job_name: t.cron_job_name });
    }
  }

  const { error } = await admin.from("tank_overlay_scenes").delete().eq("id", sceneId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function createOverlayTrigger(input: {
  sceneId: string;
  triggerType: OverlayTriggerType;
  actionKey?: string;
  cronExpression?: string;
  scope?: OverlayTriggerScope;
  roomKey?: string;
  keywordPattern?: string;
  messageCountThreshold?: number;
  message: string;
}): Promise<OverlayActionResult> {
  const admin_check = await requireAdmin();
  if ("error" in admin_check) return { success: false, error: admin_check.error };
  if (!input.message.trim()) return { success: false, error: "Message is required." };

  if (input.triggerType === "action" && !input.actionKey?.trim()) {
    return { success: false, error: "Action key is required for action triggers." };
  }
  if (input.triggerType === "cron" && !input.cronExpression?.trim()) {
    return { success: false, error: "Cron expression is required for cron triggers." };
  }
  if (input.triggerType === "keyword" && !input.keywordPattern?.trim()) {
    return { success: false, error: "Keyword is required for keyword triggers." };
  }
  if (input.triggerType === "message_count" && (!input.messageCountThreshold || input.messageCountThreshold < 1)) {
    return { success: false, error: "Message count threshold must be at least 1." };
  }
  const scope: OverlayTriggerScope = input.scope ?? "global";
  if (scope === "room" && !input.roomKey?.trim()) {
    return { success: false, error: "Room key is required when scope is room." };
  }

  const admin = createAdminClient();
  const { data: trigger, error } = await admin
    .from("tank_overlay_triggers")
    .insert({
      scene_id: input.sceneId,
      trigger_type: input.triggerType,
      action_key: input.triggerType === "action" ? input.actionKey!.trim() : null,
      cron_expression: input.triggerType === "cron" ? input.cronExpression!.trim() : null,
      scope,
      room_key: scope === "room" ? input.roomKey!.trim() : null,
      keyword_pattern: input.triggerType === "keyword" ? input.keywordPattern!.trim().toLowerCase() : null,
      message_count_threshold: input.triggerType === "message_count" ? input.messageCountThreshold : null,
      message: input.message.trim(),
      enabled: true,
    })
    .select("id")
    .single();

  if (error || !trigger) return { success: false, error: error?.message ?? "Failed to create trigger." };

  if (input.triggerType === "cron") {
    const { data: jobName, error: rpcError } = await admin.rpc("tank_schedule_overlay_trigger", {
      p_trigger_id: trigger.id,
      p_cron_expr: input.cronExpression!.trim(),
    });
    if (rpcError) {
      await admin.from("tank_overlay_triggers").delete().eq("id", trigger.id);
      return { success: false, error: `Invalid cron expression: ${rpcError.message}` };
    }
    await admin.from("tank_overlay_triggers").update({ cron_job_name: jobName }).eq("id", trigger.id);
  }

  return { success: true };
}

export async function toggleOverlayTrigger(triggerId: string, enabled: boolean): Promise<OverlayActionResult> {
  const admin_check = await requireAdmin();
  if ("error" in admin_check) return { success: false, error: admin_check.error };

  const admin = createAdminClient();
  const { data: trigger } = await admin
    .from("tank_overlay_triggers")
    .select("id, trigger_type, cron_expression, cron_job_name")
    .eq("id", triggerId)
    .maybeSingle();
  if (!trigger) return { success: false, error: "Trigger not found." };

  if (trigger.trigger_type === "cron") {
    if (enabled) {
      const { data: jobName, error: rpcError } = await admin.rpc("tank_schedule_overlay_trigger", {
        p_trigger_id: trigger.id,
        p_cron_expr: trigger.cron_expression,
      });
      if (rpcError) return { success: false, error: rpcError.message };
      await admin.from("tank_overlay_triggers").update({ cron_job_name: jobName }).eq("id", trigger.id);
    } else if (trigger.cron_job_name) {
      await admin.rpc("tank_unschedule_overlay_trigger", { p_job_name: trigger.cron_job_name });
    }
  }

  const { error } = await admin.from("tank_overlay_triggers").update({ enabled }).eq("id", triggerId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteOverlayTrigger(triggerId: string): Promise<OverlayActionResult> {
  const admin_check = await requireAdmin();
  if ("error" in admin_check) return { success: false, error: admin_check.error };

  const admin = createAdminClient();
  const { data: trigger } = await admin
    .from("tank_overlay_triggers")
    .select("cron_job_name")
    .eq("id", triggerId)
    .maybeSingle();

  if (trigger?.cron_job_name) {
    await admin.rpc("tank_unschedule_overlay_trigger", { p_job_name: trigger.cron_job_name });
  }

  const { error } = await admin.from("tank_overlay_triggers").delete().eq("id", triggerId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// Broadcasts a fired overlay event to every device with that scene's
// /overlay/<slug> browser source open (OBS, or a viewer's device for
// "utilize all speakers that can play" style events).
export async function broadcastOverlayEvent(sceneId: string, message: string): Promise<void> {
  const admin = createAdminClient();
  const { data: scene } = await admin
    .from("tank_overlay_scenes")
    .select("id, sound_key, display_seconds")
    .eq("id", sceneId)
    .maybeSingle();
  if (!scene) return;

  const channel = admin.channel(`tank:overlay:${sceneId}`);
  await channel.send({
    type: "broadcast",
    event: "fire",
    payload: { message, soundKey: scene.sound_key, displaySeconds: scene.display_seconds },
  });
}

// The primitive other app code calls directly on a real event (e.g. a Tank
// signup) — no DB trigger/webhook round-trip needed for action-type
// triggers, this runs in the same Node process as the event itself. Looks
// up every enabled action-trigger matching actionKey and fires each one's
// scene. {{message}} in a trigger's stored message is replaced with the
// caller-supplied context string.
export async function fireOverlayAction(actionKey: string, context?: string): Promise<void> {
  const admin = createAdminClient();
  const { data: triggers } = await admin
    .from("tank_overlay_triggers")
    .select("id, scene_id, message")
    .eq("trigger_type", "action")
    .eq("action_key", actionKey)
    .eq("enabled", true);

  if (!triggers || triggers.length === 0) return;

  await Promise.all(
    triggers.map(async (t) => {
      const message = context ? t.message.replace(/\{\{message\}\}/g, context) : t.message;
      await broadcastOverlayEvent(t.scene_id, message);
      await admin.from("tank_overlay_triggers").update({ last_fired_at: new Date().toISOString() }).eq("id", t.id);
    }),
  );
}

// "Crons not by time — crons by messages sent, in a room or global."
// Called once per real user chat message (hooked in actions.ts's
// sendChatMessage only — NOT from RNG or senderless house-event broadcasts, so a
// dice roll or system event doesn't itself count as chat activity and cause
// runaway compounding). Two independent checks:
//   - message_count: increments progress_count on every matching trigger,
//     fires + resets to 0 once it hits message_count_threshold.
//   - keyword: fires whenever the message body contains keyword_pattern
//     (case-insensitive substring — deliberately not regex, so a
//     mistyped pattern can't blow up or ReDoS the chat pipeline).
// A trigger matches scope 'global' for every message, or scope 'room' only
// when room_key equals the message's roomId.
export async function checkChatActivityTriggers(roomId: string, messageBody: string): Promise<void> {
  const admin = createAdminClient();
  const { data: triggers } = await admin
    .from("tank_overlay_triggers")
    .select("id, scene_id, trigger_type, scope, room_key, keyword_pattern, message_count_threshold, progress_count, message")
    .in("trigger_type", ["message_count", "keyword"])
    .eq("enabled", true);

  if (!triggers || triggers.length === 0) return;

  const lowerBody = messageBody.toLowerCase();
  const matchesScope = (t: any) => t.scope === "global" || t.room_key === roomId;

  await Promise.all(
    triggers.filter(matchesScope).map(async (t) => {
      if (t.trigger_type === "keyword") {
        if (t.keyword_pattern && lowerBody.includes(t.keyword_pattern)) {
          await broadcastOverlayEvent(t.scene_id, t.message);
          await admin
            .from("tank_overlay_triggers")
            .update({ last_fired_at: new Date().toISOString() })
            .eq("id", t.id);
        }
        return;
      }

      // message_count
      const threshold = t.message_count_threshold ?? 1;
      const nextCount = (t.progress_count ?? 0) + 1;
      if (nextCount >= threshold) {
        await broadcastOverlayEvent(t.scene_id, t.message);
        await admin
          .from("tank_overlay_triggers")
          .update({ progress_count: 0, last_fired_at: new Date().toISOString() })
          .eq("id", t.id);
      } else {
        await admin.from("tank_overlay_triggers").update({ progress_count: nextCount }).eq("id", t.id);
      }
    }),
  );
}
