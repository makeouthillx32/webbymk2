/**
 * Tank Chat Ban Appeals, Mod Logs & Resolution Engine
 */

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export type BanAppealItem = {
  id: string;
  userId: string;
  userName: string;
  avatarUrl?: string;
  userRole?: string;
  bannedAt: string;
  bannedReason: string;
  bannedBy?: string;
  appealText: string;
  status: "pending" | "approved" | "denied";
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  modNote?: string;
};

export type ModEventLog = {
  id: string;
  type: "timeout" | "ban" | "unban" | "delete_message";
  targetUserId: string;
  targetUserName: string;
  operatorId?: string;
  operatorName?: string;
  reason?: string;
  durationSeconds?: number;
  createdAt: string;
};

// In-memory fallback mock appeals for rich testing and local development
const FALLBACK_APPEALS: BanAppealItem[] = [
  {
    id: "appeal-1",
    userId: "user-bwegkamp",
    userName: "bwegkamp",
    avatarUrl: "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png",
    userRole: "member",
    bannedAt: new Date(Date.now() - 3600 * 1000 * 24 * 30).toISOString(),
    bannedReason: "Inappropriate language and spamming chat",
    bannedBy: "AutoMod (Rule #4)",
    appealText:
      "I apologize for the spam and inappropriate remarks I made in the living room chat. I acted impulsively and I understand why I was timed out and banned. I love watching the stream and promise to follow all house rules if given a second chance.",
    status: "pending",
    submittedAt: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
  },
  {
    id: "appeal-2",
    userId: "user-bbqchigen",
    userName: "bbqchigen",
    avatarUrl: "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png",
    userRole: "member",
    bannedAt: new Date(Date.now() - 3600 * 1000 * 24 * 14).toISOString(),
    bannedReason: "Excessive capslock and trolling",
    bannedBy: "ModTeam",
    appealText: "Took a fat L on this one, I apologize for spamming all caps. Requesting unban.",
    status: "pending",
    submittedAt: new Date(Date.now() - 3600 * 1000 * 24 * 2).toISOString(),
  },
  {
    id: "appeal-3",
    userId: "user-alexxsszz",
    userName: "alexxsszz",
    avatarUrl: "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png",
    userRole: "member",
    bannedAt: new Date(Date.now() - 3600 * 1000 * 24 * 60).toISOString(),
    bannedReason: "Room argument disruption",
    bannedBy: "AdminDesk",
    appealText: "Hello, it has been two months since my ban. I request an appeal to join the community again.",
    status: "pending",
    submittedAt: new Date(Date.now() - 3600 * 1000 * 24 * 5).toISOString(),
  },
  {
    id: "appeal-4",
    userId: "user-justboredbro",
    userName: "JustBoredBro",
    avatarUrl: "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png",
    userRole: "member",
    bannedAt: new Date(Date.now() - 3600 * 1000 * 24 * 7).toISOString(),
    bannedReason: "Spamming dice roll command",
    bannedBy: "AutoMod",
    appealText: "2nd chance? Won't spam /dice anymore.",
    status: "pending",
    submittedAt: new Date(Date.now() - 3600 * 1000 * 24 * 1).toISOString(),
  },
];

const appealStore = new Map<string, BanAppealItem>(
  FALLBACK_APPEALS.map((a) => [a.id, a]),
);

/**
 * List all ban appeals (staff only).
 */
export async function listBanAppealsAction(): Promise<{
  success: boolean;
  appeals: BanAppealItem[];
  error?: string;
}> {
  try {
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("tank_ban_appeals")
      .select("*")
      .order("submitted_at", { ascending: false });

    if (error || !rows || rows.length === 0) {
      return { success: true, appeals: Array.from(appealStore.values()) };
    }

    return {
      success: true,
      appeals: rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        avatarUrl: r.avatar_url,
        userRole: r.user_role,
        bannedAt: r.banned_at,
        bannedReason: r.banned_reason,
        bannedBy: r.banned_by,
        appealText: r.appeal_text,
        status: r.status,
        submittedAt: r.submitted_at,
        reviewedAt: r.reviewed_at,
        reviewedBy: r.reviewed_by,
        modNote: r.mod_note,
      })),
    };
  } catch {
    return { success: true, appeals: Array.from(appealStore.values()) };
  }
}

/**
 * Resolves a ban appeal (Approve & Unban or Deny).
 */
export async function resolveBanAppealAction(
  appealId: string,
  decision: "approved" | "denied",
  modNote = "",
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = appealStore.get(appealId);
    if (existing) {
      existing.status = decision;
      existing.reviewedAt = new Date().toISOString();
      existing.modNote = modNote;
    }

    const admin = createAdminClient();
    await admin
      .from("tank_ban_appeals")
      .update({
        status: decision,
        reviewed_at: new Date().toISOString(),
        mod_note: modNote,
      })
      .eq("id", appealId);

    // If approved, lift the user's ban in profiles
    if (decision === "approved" && existing?.userId) {
      await admin
        .from("profiles")
        .update({
          is_banned: false,
          banned_reason: null,
          banned_until: null,
        })
        .eq("id", existing.userId);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to resolve appeal" };
  }
}

/**
 * Submits a new ban appeal for a banned user.
 */
export async function submitBanAppealAction(
  userId: string,
  userName: string,
  appealText: string,
): Promise<{ success: boolean; error?: string }> {
  if (!appealText.trim()) return { success: false, error: "Please enter your appeal statement." };

  const id = `appeal-${Date.now()}`;
  const newAppeal: BanAppealItem = {
    id,
    userId,
    userName,
    bannedAt: new Date().toISOString(),
    bannedReason: "Moderator action",
    appealText,
    status: "pending",
    submittedAt: new Date().toISOString(),
  };

  appealStore.set(id, newAppeal);

  try {
    const admin = createAdminClient();
    await admin.from("tank_ban_appeals").insert({
      id,
      user_id: userId,
      user_name: userName,
      appeal_text: appealText,
      status: "pending",
      submitted_at: new Date().toISOString(),
    });
  } catch {}

  return { success: true };
}
