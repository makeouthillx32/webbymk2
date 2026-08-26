"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { TankAudioRequestKind } from "../contracts";
import type { TankInventoryEntry } from "./gamification";

// Signed-in-gated (not staff-only) throughout this file — the full profile
// page is public content among Tank viewers, same visibility model as
// TankUserMenu's profile card.
async function requireSignedIn(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

// Same shape as gamification.ts's getCurrentUserInventory(), generalized to
// an arbitrary userId instead of hardcoding the caller's own session —
// that one stays as-is for the "my inventory" UI, this one is for viewing
// someone else's.
export async function getUserInventoryFor(userId: string): Promise<TankInventoryEntry[]> {
  if (!(await requireSignedIn())) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_player_inventory")
    .select("item_id, quantity, tank_inventory_items(slug, name, description, rarity, icon_url)")
    .eq("user_id", userId)
    .order("quantity", { ascending: false });

  if (error || !data) return [];

  return data
    .map((row) => {
      const item = Array.isArray(row.tank_inventory_items) ? row.tank_inventory_items[0] : row.tank_inventory_items;
      if (!item) return null;
      return {
        itemId: row.item_id,
        slug: item.slug,
        name: item.name,
        description: item.description,
        rarity: item.rarity,
        iconUrl: item.icon_url,
        quantity: row.quantity ?? 1,
      } satisfies TankInventoryEntry;
    })
    .filter((entry): entry is TankInventoryEntry => entry !== null);
}

export type TankUserFullProfile = {
  userId: string;
  displayName: string;
  avatarUrl: string;
  nameColor: string;
  role: string;
  level: number;
  xp: number;
  tokens: number;
  joinedAt: string | null;
  xpIntoLevel: number;
  xpForNextLevel: number;
};

// Full-page header data — same real tank_profiles columns as
// getTankUserProfileCard, plus avatar/name-color pulled from
// auth.users.user_metadata the same way gamification.ts's
// getCurrentTankProfile() falls back for the signed-in user's own profile
// (tank_profiles has no avatar_url/name_color column).
export async function getTankUserFullProfile(userId: string): Promise<TankUserFullProfile | null> {
  if (!(await requireSignedIn())) return null;

  const admin = createAdminClient();
  const [{ data: tankProfile }, { data: mainProfile }, { data: authUser }] = await Promise.all([
    admin.from("tank_profiles").select("display_name, xp, level, tokens, created_at").eq("user_id", userId).maybeSingle(),
    admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);

  if (!tankProfile) return null;

  const meta = (authUser?.user?.user_metadata as Record<string, unknown>) || {};
  const level = tankProfile.level ?? 1;
  const prevLevelXp = Math.pow(Math.max(0, level - 1), 2) * 100;
  const nextLevelXp = Math.pow(level, 2) * 100;

  return {
    userId,
    displayName: tankProfile.display_name || (meta.display_name as string) || (meta.full_name as string) || "Viewer",
    avatarUrl:
      (meta.avatar_url as string) ||
      "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png",
    nameColor: (meta.name_color as string) || "#ff4d00",
    role: mainProfile?.role || "member",
    level,
    xp: tankProfile.xp ?? 0,
    tokens: tankProfile.tokens ?? 0,
    joinedAt: tankProfile.created_at,
    xpIntoLevel: Math.max(0, (tankProfile.xp ?? 0) - prevLevelXp),
    xpForNextLevel: Math.max(1, nextLevelXp - prevLevelXp),
  };
}

export type UserAudioHistoryEntry = {
  id: string;
  kind: TankAudioRequestKind;
  message: string | null;
  voiceOrSoundKey: string;
  status: string;
  createdAt: string;
};

// A user's own TTS/SFX request history, any status (not just the
// admin-only pending queue in audioRequests.ts) — what the reference
// site's "TTS History" panel shows on a profile page.
export async function getUserAudioHistory(userId: string, limit = 100): Promise<UserAudioHistoryEntry[]> {
  if (!(await requireSignedIn())) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_audio_requests")
    .select("id, kind, message, voice_or_sound_key, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 300));

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    kind: r.kind as TankAudioRequestKind,
    message: r.message,
    voiceOrSoundKey: r.voice_or_sound_key,
    status: r.status,
    createdAt: r.created_at,
  }));
}
