export const VALID_ROLES = ["admin", "member", "guest"] as const;
export type ValidRole = (typeof VALID_ROLES)[number];

export type CookieOptions = {
  path: string;
  secure: boolean;
  sameSite: "lax";
  maxAge: number;
};

export type ProfileCookieRow = {
  role: string | null;
  display_name: string | null;
};

export type ProfileUpsertRow = {
  id: string;
  auth_user_id: string; // ← required: links profile to auth.users
  email: string;        // ← required: snapshot for orders, admin UI, support
  role: ValidRole;
  display_name: string;
  first_name: string;
  last_name: string;
};