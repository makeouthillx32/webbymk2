import "server-only";

import { createClient } from "@/utils/supabase/server";

// Read-only data-access layer over the tank_* gamification tables added in
// supabase/migrations/20260814140000_tank_platform_bones.sql. Every export
// here degrades to a safe empty/zero default on error rather than throwing
// — the UI should never break because a gamification query hiccups. This
// is deliberately read-only: awarding XP/tokens (detecting "watched a
// camera", "posted a chat message", etc. and inserting into
// tank_token_transactions / tank_profiles.xp) is real gameplay logic that
// still needs to be wired on top of these bones — not done in this pass.

export type TankPlayerProfile = {
  xp: number;
  level: number;
  tokens: number;
  displayName: string | null;
};

export type TankSeason = {
  id: string;
  number: number;
  name: string;
  startsAt: string;
  endsAt: string | null;
};

export type TankMission = {
  id: string;
  title: string;
  description: string | null;
  rewardTokens: number;
  rewardXp: number;
  targetCount: number;
  progress: number;
  completedAt: string | null;
};

export type TankLeaderboardRow = {
  userId: string;
  displayName: string;
  xp: number;
  level: number;
  tokens: number;
  clanTag: string | null;
  rank: number;
};

export type TankClanMembership = {
  clanId: string;
  name: string;
  tag: string;
  bannerColor: string;
};

export type TankInventoryEntry = {
  itemId: string;
  slug: string;
  name: string;
  description: string | null;
  rarity: string;
  iconUrl: string | null;
  quantity: number;
};

const EMPTY_PROFILE: TankPlayerProfile = {
  xp: 0,
  level: 1,
  tokens: 0,
  displayName: null,
};

export async function getCurrentTankProfile(): Promise<TankPlayerProfile | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("tank_profiles")
      .select("xp, level, tokens, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) return EMPTY_PROFILE;

    return {
      xp: data.xp ?? 0,
      level: data.level ?? 1,
      tokens: data.tokens ?? 0,
      displayName: data.display_name ?? null,
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

export async function getActiveSeason(): Promise<TankSeason | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tank_seasons")
      .select("id, number, name, starts_at, ends_at")
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      number: data.number,
      name: data.name,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
    };
  } catch {
    return null;
  }
}

export async function getActiveMissions(): Promise<TankMission[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: missions, error } = await supabase
      .from("tank_missions")
      .select("id, title, description, reward_tokens, reward_xp, target_count")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error || !missions) return [];

    let progressById = new Map<string, { progress: number; completed_at: string | null }>();
    if (user) {
      const { data: progress } = await supabase
        .from("tank_mission_progress")
        .select("mission_id, progress, completed_at")
        .eq("user_id", user.id);
      for (const row of progress ?? []) {
        progressById.set(row.mission_id, {
          progress: row.progress,
          completed_at: row.completed_at,
        });
      }
    }

    return missions.map((mission) => {
      const state = progressById.get(mission.id);
      return {
        id: mission.id,
        title: mission.title,
        description: mission.description,
        rewardTokens: mission.reward_tokens ?? 0,
        rewardXp: mission.reward_xp ?? 0,
        targetCount: mission.target_count ?? 1,
        progress: state?.progress ?? 0,
        completedAt: state?.completed_at ?? null,
      };
    });
  } catch {
    return [];
  }
}

export async function getLeaderboard(limit = 10): Promise<TankLeaderboardRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tank_leaderboard")
      .select("user_id, display_name, xp, level, tokens, clan_tag, rank")
      .order("rank", { ascending: true })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      xp: row.xp ?? 0,
      level: row.level ?? 1,
      tokens: row.tokens ?? 0,
      clanTag: row.clan_tag,
      rank: row.rank,
    }));
  } catch {
    return [];
  }
}

export async function getCurrentUserClan(): Promise<TankClanMembership | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("tank_clan_members")
      .select("clan_id, tank_clans(name, tag, banner_color)")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data || !data.tank_clans) return null;
    const clan = Array.isArray(data.tank_clans) ? data.tank_clans[0] : data.tank_clans;
    if (!clan) return null;

    return {
      clanId: data.clan_id,
      name: clan.name,
      tag: clan.tag,
      bannerColor: clan.banner_color,
    };
  } catch {
    return null;
  }
}

export type TankClanSummary = {
  id: string;
  name: string;
  tag: string;
  bannerColor: string;
  memberCount: number;
};

export async function getClans(): Promise<TankClanSummary[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tank_clans")
      .select("id, name, tag, banner_color, tank_clan_members(count)")
      .order("name", { ascending: true });

    if (error || !data) return [];

    return data.map((row) => {
      const countRow = Array.isArray(row.tank_clan_members)
        ? row.tank_clan_members[0]
        : row.tank_clan_members;
      return {
        id: row.id,
        name: row.name,
        tag: row.tag,
        bannerColor: row.banner_color,
        memberCount: (countRow as { count?: number } | undefined)?.count ?? 0,
      };
    });
  } catch {
    return [];
  }
}

export type TankArchiveEntry = {
  id: string;
  title: string;
  episodeNumber: number | null;
  airedAt: string | null;
  description: string | null;
};

export async function getArchives(limit = 20): Promise<TankArchiveEntry[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tank_archives")
      .select("id, title, episode_number, aired_at, description")
      .order("aired_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      title: row.title,
      episodeNumber: row.episode_number,
      airedAt: row.aired_at,
      description: row.description,
    }));
  } catch {
    return [];
  }
}

export type TankTokenTransaction = {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
};

export async function getRecentTokenTransactions(limit = 20): Promise<TankTokenTransaction[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("tank_token_transactions")
      .select("id, amount, reason, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      amount: row.amount,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

export async function getCurrentUserInventory(): Promise<TankInventoryEntry[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("tank_player_inventory")
      .select("item_id, quantity, tank_inventory_items(slug, name, description, rarity, icon_url)")
      .eq("user_id", user.id);

    if (error || !data) return [];

    return data
      .map((row) => {
        const item = Array.isArray(row.tank_inventory_items)
          ? row.tank_inventory_items[0]
          : row.tank_inventory_items;
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
  } catch {
    return [];
  }
}
