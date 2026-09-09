import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

// Whether the current request is from staff, and nothing more.
//
// Identity is verified against Supabase Auth, then authorization is read from
// the canonical core `profiles.role` record through the server-only admin
// client. This deliberately matches the Tank admin page guard. Relying only on
// JWT app_metadata made staff access drift until a token refresh, while using
// user_metadata would be unsafe because users can edit it themselves.

export type StaffUser = { id: string; role: "admin" | "moderator" };

export async function requireStaff(): Promise<StaffUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return null;
  const role = String(profile?.role ?? "");
  if (role !== "admin" && role !== "moderator") return null;

  return { id: user.id, role };
}
