// "researcher" = a member who accepted the research-use ToS at sign-up.
// Practically the same tier as "member" everywhere except it's what
// research-checkout gates on — see src/lib/research/requireResearcherRole.ts.
export const VALID_ROLES = ["admin", "member", "guest", "researcher"] as const;
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
  terms_accepted_at?: string; // ISO timestamp — set when the sign-up ToS checkbox is accepted
};