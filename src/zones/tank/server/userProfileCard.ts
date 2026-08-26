"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export type TankProfileBadge = {
  iconUrl: string | null;
  name: string;
};

export type TankUserProfileCard = {
  userId: string;
  displayName: string;
  level: number;
  xp: number;
  tokens: number;
  joinedAt: string | null;
  badges: TankProfileBadge[];
  extraBadgeCount: number;
};

// Signed-in-gated, not staff-only — any viewer can click a person and see
// their public stats, same as the reference site's profile card. Only
// tank_profiles' real columns are queried (user_id, display_name, xp,
// level, tokens, created_at — confirmed via schema; it has no avatar_url
// or name_color, unlike gamification.ts's getCurrentTankProfile() which
// selects those and has silently been getting nulls back). Avatar/name
// color for the card come from the clicked chat message instead, which
// already carries the real broadcasted values.
export async function getTankUserProfileCard(userId: string): Promise<TankUserProfileCard | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const [{ data: tankProfile }, { data: inventory }] = await Promise.all([
    admin
      .from("tank_profiles")
      .select("user_id, display_name, xp, level, tokens, created_at")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("tank_player_inventory")
      .select("quantity, tank_inventory_items(name, icon_url)")
      .eq("user_id", userId)
      .limit(20),
  ]);

  if (!tankProfile) return null;

  const badges: TankProfileBadge[] = (inventory ?? [])
    .map((row: any) => {
      const item = Array.isArray(row.tank_inventory_items) ? row.tank_inventory_items[0] : row.tank_inventory_items;
      if (!item) return null;
      return { iconUrl: item.icon_url as string | null, name: item.name as string };
    })
    .filter((b): b is TankProfileBadge => Boolean(b));

  const MAX_VISIBLE_BADGES = 6;

  return {
    userId,
    displayName: tankProfile.display_name || "Viewer",
    level: tankProfile.level ?? 1,
    xp: tankProfile.xp ?? 0,
    tokens: tankProfile.tokens ?? 0,
    joinedAt: tankProfile.created_at,
    badges: badges.slice(0, MAX_VISIBLE_BADGES),
    extraBadgeCount: Math.max(0, badges.length - MAX_VISIBLE_BADGES),
  };
}
