// lib/storefront/members/sources/fetchProfiles.ts
import { createClient } from "@/utils/supabase/server";
import { ProfileRow, StoreRole } from "../types";

function normalizeRole(role: unknown): StoreRole | null {
  if (role === "admin" || role === "member" || role === "guest") return role;
  return null;
}

/**
 * Fetch profiles/customers.
 * This MUST include guest records (auth_user_id = null) for storefront.
 *
 * Update table/columns once you share the schema.
 */
export async function fetchProfiles(): Promise<ProfileRow[]> {
  const supabase = await createClient();

  // TODO: replace "profiles" + column list with your real storefront schema.
  const { data, error } = await supabase
    .from("profiles")
    .select(
      [
        "id",
        "auth_user_id",
        "display_name",
        "email",
        "avatar_url",
        "role",
        "created_at",
        "last_sign_in_at",
        "email_confirmed_at",
        // If you store providers in JSON metadata, swap this out accordingly.
        // Example: "app_metadata"
      ].join(",")
    );

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    auth_user_id: row.auth_user_id ?? null,
    display_name: row.display_name ?? null,
    email: row.email ?? null,
    avatar_url: row.avatar_url ?? null,
    role: normalizeRole(row.role),
    created_at: row.created_at ?? null,
    last_sign_in_at: row.last_sign_in_at ?? null,
    email_confirmed_at: row.email_confirmed_at ?? null,
    providers: null,
  }));
}
