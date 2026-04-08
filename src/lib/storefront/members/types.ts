// lib/storefront/members/types.ts

export type StoreRole = "admin" | "member" | "guest";

export type AuthUserRow = {
  id: string;
  email: string | null;
  display_name?: string | null;
};

export type ProfileRow = {
  id: string;                 // profile/customer id
  auth_user_id: string | null; // null means guest
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: StoreRole | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  providers: string[] | null; // if you store providers in profile metadata
};

export type MemberRow = {
  id: string; // profile/customer id (preferred stable ID)
  auth_user_id: string | null;

  display_name: string;
  email: string;

  role: StoreRole;
  role_label: string;

  avatar_url: string;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;

  auth_providers: string[];
};
