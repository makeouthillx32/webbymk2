"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  projectPollForViewer,
  sanitizeAnonymousPollClientId,
  type ActivePoll,
  type PollView,
} from "./pollContract";

const ACTIVE_POLL_SETTING_KEY = "tank_active_poll_v1";

async function resolveVoterKey(anonymousClientId?: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  } catch {}

  const clientId = sanitizeAnonymousPollClientId(anonymousClientId);
  return clientId ? `anon_${clientId}` : null;
}

async function persistHouseLine(body: string, messageType: "announcement" | "house_event" = "announcement") {
  const admin = createAdminClient();
  const { data } = await admin.from("tank_chat_messages").insert({
    // "director" was never a real chat room — tank_chat_messages_click_scope_check
    // forbids it outright, so every poll start/conclusion announcement was
    // silently failing this insert (createPollAction/endPollAction don't
    // check persistHouseLine's result). "global" is the actual live room —
    // confirmed 2026-08-22 against real chat_messages rows.
    room_id: "global",
    user_id: null,
    user_name: "HOUSE",
    user_role: "system",
    body,
    message_type: messageType,
  }).select("id, created_at").single();
  return data ? {
    id: data.id,
    user: "HOUSE",
    body,
    time: new Date(data.created_at).toLocaleString(),
    createdAt: data.created_at,
    messageType,
  } : null;
}

async function getPollStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles")
    .select("display_name, role").eq("id", user.id).maybeSingle();
  if (!profile || !["admin", "moderator"].includes(String(profile.role))) return null;
  return { user, profile };
}

/**
 * Gets the current active poll from database
 */
export async function getActivePoll(): Promise<ActivePoll | null> {
  const adminSupabase = createAdminClient();

  try {
    const { data } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", ACTIVE_POLL_SETTING_KEY)
      .single();

    if (!data || !data.value) return null;

    const poll = data.value as ActivePoll;
    if (!poll.active) return null;

    // Check expiration
    if (poll.expiresAt && Date.now() > poll.expiresAt) {
      poll.active = false;
      await adminSupabase.from("tank_platform_settings").upsert(
        {
          key: ACTIVE_POLL_SETTING_KEY,
          value: poll,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
      return null;
    }

    return poll;
  } catch {
    return null;
  }
}

/** Public projection: totals plus only this viewer's selection. */
export async function getPublicActivePoll(
  anonymousClientId?: string,
): Promise<PollView | null> {
  const poll = await getActivePoll();
  if (!poll) return null;
  return projectPollForViewer(poll, await resolveVoterKey(anonymousClientId));
}

/**
 * Creates and broadcasts a new house poll
 */
export async function createPollAction(params: {
  question: string;
  options: string[];
  durationMinutes?: number | "indefinite";
}): Promise<{ success: boolean; poll?: ActivePoll; error?: string }> {
  const staff = await getPollStaff();
  if (!staff) return { success: false, error: "Staff only." };

  const question = params.question.trim();
  const validOptions = params.options.map((o) => o.trim()).filter((o) => o.length > 0);

  if (question.length < 3) {
    return { success: false, error: "Poll question must be at least 3 characters." };
  }
  if (validOptions.length < 2) {
    return { success: false, error: "Poll must have at least 2 options." };
  }

  const durationMinutes = params.durationMinutes ?? 5;
  const now = Date.now();
  const expiresAt = durationMinutes === "indefinite" ? null : now + durationMinutes * 60 * 1000;
  const createdBy =
    staff.profile.display_name ||
    "Director Staff";

  const newPoll: ActivePoll = {
    id: `poll_${now}`,
    question,
    options: validOptions.map((text, idx) => ({ id: idx, text, votes: 0 })),
    totalVotes: 0,
    votedUserIds: {},
    createdAt: now,
    expiresAt,
    durationMinutes,
    createdBy,
    active: true,
  };

  const adminSupabase = createAdminClient();

  try {
    await adminSupabase.from("tank_platform_settings").upsert(
      {
        key: ACTIVE_POLL_SETTING_KEY,
        value: newPoll,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    // Broadcast poll to all connected chat clients in real-time
    const channel = adminSupabase.channel("room:director:chat");
    await channel.httpSend("new_poll", newPoll);

    // Also send an official CONSOLE announcement in chat stream
    const announcement = await persistHouseLine(
      `📊 LIVE POLL STARTED: "${question}" — Open House Poll from the action menu to vote. (⏱️ ${durationMinutes === "indefinite" ? "Open" : `${durationMinutes}m`})`,
    );
    if (announcement) await channel.httpSend("new_message", announcement);
    await adminSupabase.removeChannel(channel);

    return { success: true, poll: newPoll };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to create poll." };
  }
}

/**
 * Casts a vote on the active poll (supports both registered and anonymous viewers)
 */
export async function votePollAction(params: {
  pollId: string;
  optionIndex: number;
  anonymousClientId?: string;
}): Promise<{ success: boolean; poll?: PollView; error?: string }> {
  const voterKey = await resolveVoterKey(params.anonymousClientId);
  if (!voterKey) {
    return {
      success: false,
      error: "This browser could not establish a stable poll identity. Refresh and try again.",
    };
  }

  const adminSupabase = createAdminClient();

  try {
    const { data, error } = await adminSupabase.rpc("tank_cast_poll_vote", {
      p_poll_id: params.pollId,
      p_voter_key: voterKey,
      p_option_index: params.optionIndex,
    });
    if (error || !data) return { success: false, error: error?.message || "Vote failed." };
    const poll = data as ActivePoll;

    // Broadcast updated vote counts
    const channel = adminSupabase.channel("room:director:chat");
    await channel.httpSend("poll_updated", projectPollForViewer(poll, null));
    await adminSupabase.removeChannel(channel);

    return { success: true, poll: projectPollForViewer(poll, voterKey) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Vote failed." };
  }
}

/**
 * Closes an active poll manually and announces results in chat
 */
export async function endPollAction(pollId: string): Promise<{ success: boolean; error?: string }> {
  const staff = await getPollStaff();
  if (!staff) return { success: false, error: "Staff only." };
  const adminSupabase = createAdminClient();

  try {
    const { data } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", ACTIVE_POLL_SETTING_KEY)
      .single();

    if (!data || !data.value) return { success: false, error: "No active poll." };

    const poll = data.value as ActivePoll;
    if (poll.id !== pollId) return { success: false, error: "Poll ID mismatch." };

    poll.active = false;
    await adminSupabase.from("tank_platform_settings").upsert(
      {
        key: ACTIVE_POLL_SETTING_KEY,
        value: poll,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    // Determine winner
    let winningOption = poll.options[0];
    for (const opt of poll.options) {
      if (opt.votes > winningOption.votes) {
        winningOption = opt;
      }
    }

    const channel = adminSupabase.channel("room:director:chat");
    await channel.httpSend("poll_ended", { pollId, winner: winningOption, totalVotes: poll.totalVotes });

    const announcement = await persistHouseLine(
      `🏆 POLL CONCLUDED: "${poll.question}" ➔ WINNER: "${winningOption.text}" with ${winningOption.votes}/${poll.totalVotes} votes!`,
    );
    if (announcement) await channel.httpSend("new_message", announcement);
    await adminSupabase.removeChannel(channel);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to end poll." };
  }
}
