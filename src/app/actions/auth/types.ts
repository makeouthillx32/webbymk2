"use server";

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
  role: ValidRole;
  display_name: string;
  first_name: string;
  last_name: string;
};

export const normalizeRole = (role: unknown): ValidRole => {
  if (typeof role !== "string") return "member";
  if ((VALID_ROLES as readonly string[]).includes(role)) return role as ValidRole;
  return "member";
};s