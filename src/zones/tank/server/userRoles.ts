"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export type PromotableRole = "member" | "moderator" | "admin";

export type SetRoleResult = { success: boolean; error?: string };

// Admin-only role change, callable straight from the chat's click-on-a-user
// menu (TankUserMenu.tsx) instead of needing a separate admin panel —
// mirrors the click-username-to-moderate pattern already used in the
// dashboard messaging system (MessageContextMenu.tsx / MessageItem.tsx).
export async function setTankUserRole(
  targetUserId: string,
  newRole: PromotableRole,
): Promise<SetRoleResult> {
  if (!targetUserId?.trim()) return { success: false, error: "Missing target user." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };
  if (user.id === targetUserId) {
    return { success: false, error: "You cannot change your own role here." };
  }

  const admin = createAdminClient();
  const { data: actingProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if ((actingProfile?.role || "user") !== "admin") {
    return { success: false, error: "Admin only." };
  }

  const clearanceLevel = newRole === "admin" ? 3 : newRole === "moderator" ? 2 : 1;
  const { error } = await admin
    .from("profiles")
    .update({ role: newRole, clearance_level: clearanceLevel })
    .eq("id", targetUserId);
  if (error) return { success: false, error: error.message };

  // Also sync with auth.users raw_user_meta_data and raw_app_meta_data
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(targetUserId);
    if (authUser?.user) {
      await admin.auth.admin.updateUserById(targetUserId, {
        app_metadata: { ...(authUser.user.app_metadata || {}), role: newRole, clearance_level: clearanceLevel },
        user_metadata: { ...(authUser.user.user_metadata || {}), role: newRole, clearance_level: clearanceLevel },
      });
    }
  } catch {}

  return { success: true };
}

export type PlatformUserSummary = {
  id: string;
  email: string | null;
  displayName: string;
  role: string;
  clearanceLevel?: number;
  avatarUrl: string | null;
  authProvider: string;
  verifiedVia: string;
  emailVerified: boolean;
  xp: number;
  tokens: number;
  level: number;
  createdAt: string;
};

type AuthVerificationSnapshot = {
  provider: string;
  verifiedVia: string;
  emailVerified: boolean;
};

async function listAuthVerificationSnapshots(
  admin: ReturnType<typeof createAdminClient>,
): Promise<Map<string, AuthVerificationSnapshot>> {
  const snapshots = new Map<string, AuthVerificationSnapshot>();
  const perPage = 1000;

  // Staff Room must use Auth as the verification source of truth. Tank's
  // profile columns are a useful projection, but they can lag when somebody
  // verifies through another zone or when a profile is restored separately.
  // Paginate deliberately: a single listUsers() call silently stops at its
  // page boundary and would make older members look pending again.
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    for (const user of data.users) {
      const provider =
        (user.app_metadata?.provider as string | undefined) ||
        (user.identities?.[0]?.provider as string | undefined) ||
        "email";
      const emailVerified =
        provider !== "email" || Boolean(user.email_confirmed_at || user.confirmed_at);

      snapshots.set(user.id, {
        provider,
        emailVerified,
        verifiedVia: provider !== "email"
          ? `${provider}_oauth`
          : emailVerified
          ? "email_link"
          : "unverified",
      });
    }

    if (data.users.length < perPage) break;
  }

  return snapshots;
}

export async function listAllPlatformUsers(): Promise<PlatformUserSummary[]> {
  try {
    const admin = createAdminClient();
    // 1. Fetch only users registered in tank_profiles
    const [{ data: tankProfiles }, { data: profiles }, authSnapshots] = await Promise.all([
      admin
        .from("tank_profiles")
        .select("user_id, display_name, xp, tokens, level, auth_provider, verified_via, email_verified, created_at")
        .order("created_at", { ascending: false }),
      admin
        .from("profiles")
        .select("id, email, display_name, role, clearance_level, avatar_url, auth_provider, verified_via, created_at"),
      listAuthVerificationSnapshots(admin),
    ]);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    return (tankProfiles || [])
      .map((tank) => {
        const coreProfile = profileMap.get(tank.user_id);
        const authSnapshot = authSnapshots.get(tank.user_id);
        const coreRole = (coreProfile?.role || "").toLowerCase();

        // STRICT ISOLATION: Never include core researchers or non-tank profiles
        if (coreRole === "researcher" || coreRole === "research") {
          return null;
        }

        const role =
          coreRole === "admin"
            ? "admin"
            : coreRole === "moderator" || (coreProfile?.clearance_level && coreProfile.clearance_level >= 2)
            ? "moderator"
            : "member";
        const provider =
          authSnapshot?.provider || tank.auth_provider || coreProfile?.auth_provider || "email";
        const verifiedVia =
          authSnapshot?.verifiedVia ||
          tank.verified_via ||
          coreProfile?.verified_via ||
          (provider !== "email" ? `${provider}_oauth` : "unverified");
        const isVerified =
          authSnapshot?.emailVerified ??
          tank.email_verified ??
          (provider !== "email" || verifiedVia !== "unverified");

        return {
          id: tank.user_id,
          email: coreProfile?.email || null,
          displayName:
            tank.display_name ||
            coreProfile?.display_name ||
            coreProfile?.email?.split("@")[0] ||
            "Tank Member",
          role,
          avatarUrl: coreProfile?.avatar_url || null,
          authProvider: provider,
          verifiedVia,
          emailVerified: isVerified,
          xp: tank.xp || 0,
          tokens: tank.tokens || 0,
          level: tank.level || 1,
          createdAt: tank.created_at || coreProfile?.created_at || new Date().toISOString(),
        };
      })
      .filter((u): u is PlatformUserSummary => u !== null);
  } catch {
    return [];
  }
}
