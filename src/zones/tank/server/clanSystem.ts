"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { RpgPillar, RpgSubclass, RpgSubclassInfo } from "../clanData";

// RPG_PILLARS / RPG_SUBCLASSES data moved to ../clanData.ts (plain
// module) — this file's "use server" directive requires every export
// to be an async function, and those were plain objects imported
// directly by a client component. See clanData.ts for the full catalog.

export type ClanHierarchyRank = "warlord" | "officer" | "veteran" | "recruit";

export type ClanMemberDetails = {
  userId: string;
  userName: string;
  avatarUrl?: string;
  subclass: RpgSubclass;
  rank: ClanHierarchyRank;
  isLeader: boolean;
  level: number;
  xp: number;
  joinedAt: string;
};

export type ClanFullDetails = {
  id: string;
  name: string;
  tag: string;
  motto: string;
  bannerColor: string;
  leaderId: string;
  leaderName: string;
  memberCount: number;
  totalXp: number;
  createdAt: string;
  members: ClanMemberDetails[];
};

export type UserClanMembershipState = {
  clanId: string;
  clanName: string;
  clanTag: string;
  bannerColor: string;
  subclass: RpgSubclass;
  rank: ClanHierarchyRank;
  isLeader: boolean;
  hasSeasonPass: boolean;
};

const CLAN_METADATA_SETTING_KEY = "tank_clans_metadata_v2";
const USER_SUBCLASSES_SETTING_KEY = "tank_clan_user_subclasses_v2";
const SEASON_PASS_USERS_SETTING_KEY = "tank_season_pass_users_v2";
const USER_RANKS_SETTING_KEY = "tank_clan_user_ranks_v2";

/**
 * Checks if user has an active Season Pass
 */
export async function getUserSeasonPassStatus(userId: string): Promise<boolean> {
  const adminSupabase = createAdminClient();

  try {
    const { data } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", SEASON_PASS_USERS_SETTING_KEY)
      .single();

    if (data?.value && Array.isArray(data.value)) {
      return data.value.includes(userId);
    }
  } catch {}

  return false;
}

/**
 * Grants or toggles Season Pass for a user (Admin/Stripe Hook)
 */
export async function setSeasonPassStatus(userId: string, active: boolean) {
  const adminSupabase = createAdminClient();

  try {
    const { data } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", SEASON_PASS_USERS_SETTING_KEY)
      .single();

    let list: string[] = Array.isArray(data?.value) ? data.value : [];
    if (active && !list.includes(userId)) {
      list.push(userId);
    } else if (!active) {
      list = list.filter((id) => id !== userId);
    }

    await adminSupabase.from("tank_platform_settings").upsert(
      {
        key: SEASON_PASS_USERS_SETTING_KEY,
        value: list,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to set pass." };
  }
}

/**
 * Retrieves all clans with full member rosters, mottos, and leader info
 */
export async function getDetailedClansList(): Promise<ClanFullDetails[]> {
  const adminSupabase = createAdminClient();

  try {
    const { data: clansData } = await adminSupabase
      .from("tank_clicks")
      .select("id, name, tag, description, banner_color, created_at")
      .order("created_at", { ascending: false });

    if (!clansData || clansData.length === 0) return [];

    const { data: membersData } = await adminSupabase
      .from("tank_click_members")
      .select("click_id, user_id, role, joined_at");

    const { data: expData } = await adminSupabase
      .from("tank_user_experience")
      .select("user_id, current_xp, current_level");

    const { data: profilesData } = await adminSupabase
      .from("profiles")
      .select("id, full_name, avatar_url");

    // Fetch custom clan metadata (mottos, leaders, subclasses, ranks)
    const { data: metaSetting } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", CLAN_METADATA_SETTING_KEY)
      .single();

    const metaMap: Record<string, { leaderId?: string; leaderName?: string; motto?: string }> =
      metaSetting?.value ?? {};

    const { data: subSetting } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", USER_SUBCLASSES_SETTING_KEY)
      .single();

    const subMap: Record<string, RpgSubclass> = subSetting?.value ?? {};

    const { data: rankSetting } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", USER_RANKS_SETTING_KEY)
      .single();

    const rankMap: Record<string, ClanHierarchyRank> = rankSetting?.value ?? {};

    const expMap = new Map<string, { xp: number; level: number }>();
    for (const exp of expData ?? []) {
      expMap.set(exp.user_id, { xp: exp.current_xp ?? 0, level: exp.current_level ?? 1 });
    }

    const nameMap = new Map<string, { name: string; avatar?: string }>();
    for (const p of profilesData ?? []) {
      nameMap.set(p.id, { name: p.full_name || "Member", avatar: p.avatar_url });
    }

    // Group members by clan (No limits on roster size!)
    const membersByClan = new Map<string, ClanMemberDetails[]>();
    for (const m of membersData ?? []) {
      const stats = expMap.get(m.user_id);
      const prof = nameMap.get(m.user_id);
      const meta = metaMap[m.click_id];
      const isLeader = meta?.leaderId === m.user_id || m.role === "leader" || m.role === "warlord";
      const subclass: RpgSubclass = isLeader
        ? "warlord"
        : subMap[m.user_id] || (m.role as RpgSubclass) || "juggernaut";
      const rank: ClanHierarchyRank = isLeader
        ? "warlord"
        : rankMap[m.user_id] || (stats?.level && stats.level >= 4 ? "veteran" : "recruit");

      const memberItem: ClanMemberDetails = {
        userId: m.user_id,
        userName: prof?.name || "Viewer",
        avatarUrl: prof?.avatar,
        subclass,
        rank,
        isLeader,
        level: stats?.level ?? 1,
        xp: stats?.xp ?? 0,
        joinedAt: new Date(m.joined_at).toLocaleDateString(),
      };

      const list = membersByClan.get(m.click_id) ?? [];
      list.push(memberItem);
      membersByClan.set(m.click_id, list);
    }

    return clansData.map((c) => {
      const clanMembers = membersByClan.get(c.id) ?? [];
      const meta = metaMap[c.id];
      const leader = clanMembers.find((m) => m.isLeader) || clanMembers[0];
      const totalXp = clanMembers.reduce((sum, m) => sum + m.xp, 0);

      return {
        id: c.id,
        name: c.name,
        tag: c.tag,
        motto: meta?.motto || c.description || "Fighting for glory in the Tank.",
        bannerColor: c.banner_color || "#3b82f6",
        leaderId: meta?.leaderId || leader?.userId || "",
        leaderName: meta?.leaderName || leader?.userName || "Click Founder",
        memberCount: clanMembers.length,
        totalXp,
        createdAt: new Date(c.created_at).toLocaleDateString(),
        members: clanMembers,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Gets the current signed-in user's clan membership & RPG subclass
 */
export async function getCurrentUserClanState(): Promise<UserClanMembershipState | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    const hasSeasonPass = await getUserSeasonPassStatus(user.id);

    const { data: membership } = await supabase
      .from("tank_click_members")
      .select("click_id, role, tank_clicks(name, tag, banner_color)")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || !membership.tank_clicks) {
      return {
        clanId: "",
        clanName: "",
        clanTag: "",
        bannerColor: "",
        subclass: "juggernaut",
        rank: "recruit",
        isLeader: false,
        hasSeasonPass,
      };
    }

    const clan = Array.isArray(membership.tank_clicks)
      ? membership.tank_clicks[0]
      : membership.tank_clicks;

    const adminSupabase = createAdminClient();
    const { data: subSetting } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", USER_SUBCLASSES_SETTING_KEY)
      .single();

    const subMap: Record<string, RpgSubclass> = subSetting?.value ?? {};
    const { data: metaSetting } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", CLAN_METADATA_SETTING_KEY)
      .single();

    const metaMap: Record<string, { leaderId?: string }> = metaSetting?.value ?? {};
    const isLeader = metaMap[membership.click_id]?.leaderId === user.id || membership.role === "leader";

    const { data: rankSetting } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", USER_RANKS_SETTING_KEY)
      .single();

    const rankMap: Record<string, ClanHierarchyRank> = rankSetting?.value ?? {};
    const rank: ClanHierarchyRank = isLeader ? "warlord" : rankMap[user.id] || "recruit";

    return {
      clanId: membership.click_id,
      clanName: clan?.name || "",
      clanTag: clan?.tag || "",
      bannerColor: clan?.banner_color || "#3b82f6",
      subclass: isLeader ? "warlord" : subMap[user.id] || "juggernaut",
      rank,
      isLeader,
      hasSeasonPass,
    };
  } catch {
    return null;
  }
}

/**
 * Creates a brand new Click.
 * Requires: Season Pass OR Iceberg Level 4+ and 100 Tokens.
 */
export async function createClanAction(params: {
  name: string;
  tag: string;
  motto?: string;
  bannerColor?: string;
}): Promise<{ success: boolean; error?: string; clanId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in to create a Click." };

  const name = params.name.trim();
  const rawTag = params.tag.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const motto = params.motto?.trim() || "Glory in the Tank";
  const bannerColor = params.bannerColor || "#ff5a36";

  if (name.length < 3 || name.length > 24) {
    return { success: false, error: "Click name must be between 3 and 24 characters." };
  }
  if (rawTag.length < 2 || rawTag.length > 5) {
    return { success: false, error: "Click tag must be between 2 and 5 alphanumeric characters." };
  }

  const adminSupabase = createAdminClient();

  // 1. Verify eligibility: Season Pass OR Level 4+
  const hasSeasonPass = await getUserSeasonPassStatus(user.id);
  const { data: exp } = await adminSupabase
    .from("tank_user_experience")
    .select("current_level, tokens_balance")
    .eq("user_id", user.id)
    .single();

  const userLevel = exp?.current_level ?? 1;
  const userTokens = exp?.tokens_balance ?? 0;

  if (!hasSeasonPass && userLevel < 4) {
    return {
      success: false,
      error: "Creating a Click requires Season Pass Holder status or reaching Iceberg Level 4+.",
    };
  }

  if (userTokens < 100 && !hasSeasonPass) {
    return { success: false, error: "Creating a Click costs 100 tokens (or active Season Pass)." };
  }

  try {
    // 2. Deduct tokens if not pass holder
    if (!hasSeasonPass && userTokens >= 100) {
      await adminSupabase
        .from("tank_user_experience")
        .update({ tokens_balance: userTokens - 100 })
        .eq("user_id", user.id);
    }

    // 3. Create Clan record
    const { data: newClan, error: createErr } = await adminSupabase
      .from("tank_clicks")
      .insert({
        name,
        tag: rawTag,
        description: motto,
        banner_color: bannerColor,
      })
      .select("id")
      .single();

    if (createErr || !newClan) {
      return { success: false, error: createErr?.message || "Failed to create Click." };
    }

    const userName =
      (user.user_metadata?.full_name as string) ||
      (user.user_metadata?.user_name as string) ||
      "Leader";

    // 4. Save Clan Leader metadata
    const { data: metaSetting } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", CLAN_METADATA_SETTING_KEY)
      .single();

    const metaMap = metaSetting?.value ?? {};
    metaMap[newClan.id] = {
      leaderId: user.id,
      leaderName: userName,
      motto,
    };

    await adminSupabase.from("tank_platform_settings").upsert(
      {
        key: CLAN_METADATA_SETTING_KEY,
        value: metaMap,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    // 5. Add creator as Clan Warlord / Leader
    await adminSupabase.from("tank_click_members").delete().eq("user_id", user.id);
    await adminSupabase.from("tank_click_members").insert({
      click_id: newClan.id,
      user_id: user.id,
      role: "warlord",
    });

    // 6. Broadcast clan creation announcement in chat
    const channel = adminSupabase.channel("room:global:chat");
    await channel.send({
      type: "broadcast",
      event: "new_message",
      payload: {
        id: `clan_found_${Date.now()}`,
        userId: "00000000-0000-0000-0000-000000000000",
        user: "CONSOLE",
        body: `🛡️ New Click Founded: [${rawTag}] ${name} by ${userName}! Members can now join it from the Clicks Deck.`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        role: "admin",
        messageType: "action",
      },
    });

    return { success: true, clanId: newClan.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Click creation failed." };
  }
}

/**
 * Joins a Click and selects an RPG Subclass
 */
export async function joinClanWithSubclassAction(
  clanId: string,
  subclass: RpgSubclass = "juggernaut",
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in to join a Click." };

  const adminSupabase = createAdminClient();

  try {
    // Leave any existing clan
    await adminSupabase.from("tank_click_members").delete().eq("user_id", user.id);

    // Join target clan
    const { error: joinErr } = await adminSupabase.from("tank_click_members").insert({
      click_id: clanId,
      user_id: user.id,
      role: subclass,
    });

    if (joinErr) return { success: false, error: joinErr.message };

    // Save user subclass preference
    const { data: subSetting } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", USER_SUBCLASSES_SETTING_KEY)
      .single();

    const subMap = subSetting?.value ?? {};
    subMap[user.id] = subclass;

    await adminSupabase.from("tank_platform_settings").upsert(
      {
        key: USER_SUBCLASSES_SETTING_KEY,
        value: subMap,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to join Click." };
  }
}

/**
 * Changes active member's RPG subclass
 */
export async function setMemberSubclassAction(
  subclass: RpgSubclass,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sign in required." };

  const adminSupabase = createAdminClient();

  try {
    const { data: subSetting } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", USER_SUBCLASSES_SETTING_KEY)
      .single();

    const subMap = subSetting?.value ?? {};
    subMap[user.id] = subclass;

    await adminSupabase.from("tank_platform_settings").upsert(
      {
        key: USER_SUBCLASSES_SETTING_KEY,
        value: subMap,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    await adminSupabase
      .from("tank_click_members")
      .update({ role: subclass })
      .eq("user_id", user.id);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to change subclass." };
  }
}

export async function leaveClan(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const { error } = await supabase
    .from("tank_click_members")
    .delete()
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
