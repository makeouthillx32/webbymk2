// lib/storefront/members/merge.ts
import { AuthUserRow, MemberRow, ProfileRow, StoreRole } from "./types";

const DEFAULT_AVATAR = "/images/user/user-03.png";

function roleLabel(role: StoreRole): string {
  if (role === "admin") return "Admin";
  if (role === "member") return "Member";
  return "Guest";
}

export function mergeMembers(args: {
  profiles: ProfileRow[];
  authUsers: AuthUserRow[];
}): MemberRow[] {
  const { profiles, authUsers } = args;

  const authById = new Map(authUsers.map((u) => [u.id, u]));

  // Source of truth: profiles/customers (includes guests)
  return profiles.map((p) => {
    const auth = p.auth_user_id ? authById.get(p.auth_user_id) : undefined;

    const role: StoreRole =
      p.role ??
      (p.auth_user_id ? "member" : "guest"); // safe default

    const display_name =
      p.display_name ??
      auth?.display_name ??
      "Unnamed";

    const email =
      p.email ??
      auth?.email ??
      "No email";

    const providers =
      p.providers ??
      (auth ? ["email"] : ["guest"]);

    return {
      id: p.id,
      auth_user_id: p.auth_user_id,

      display_name,
      email,

      role,
      role_label: roleLabel(role),

      avatar_url: p.avatar_url || DEFAULT_AVATAR,
      created_at: p.created_at,
      last_sign_in_at: p.last_sign_in_at,
      email_confirmed_at: p.email_confirmed_at,
      auth_providers: providers,
    };
  });
}
