import { createClient } from "@/utils/supabase/server";

// Whether the current request is from staff, and nothing more.
//
// Role lives in the Supabase auth user's app_metadata — set via the admin API
// in userRoles.ts — never in a database table. Three routes built this session
// (mode, telemetry/simulate, telemetry/live) each queried tank_profiles for a
// `role` column that has never existed on that table, so requireStaff() failed
// closed for every request, including real admins, with a 403 that gave no
// hint why. That is what made the detection simulator look like it did
// nothing: it was being rejected before it ever reached the telemetry store.

export type StaffUser = { id: string; role: "admin" | "moderator" };

export async function requireStaff(): Promise<StaffUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const role = (user.app_metadata?.role as string) || (user.user_metadata?.role as string) || "";
  if (role !== "admin" && role !== "moderator") return null;

  return { id: user.id, role };
}
