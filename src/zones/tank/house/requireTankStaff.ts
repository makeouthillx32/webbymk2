import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function requireTankStaff() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("https://auth.unenter.live/sign-in?next=https%3A%2F%2Ftank.unenter.live%2Fhouse");
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, clearance_level, display_name")
    .eq("id", user.id)
    .single();

  const role = (profile?.role || "user").toLowerCase();
  const clearance = profile?.clearance_level ?? (role === "admin" ? 3 : role === "moderator" ? 2 : 1);
  const isAuthorized = role === "admin" || role === "moderator" || clearance >= 2;

  if (!isAuthorized) {
    redirect("/?error=moderator_access_required");
  }

  return {
    user,
    role: (role === "admin" || clearance >= 3 ? "admin" : "moderator") as "admin" | "moderator",
    displayName: profile?.display_name || user.email?.split("@")[0] || "Moderator",
  };
}
