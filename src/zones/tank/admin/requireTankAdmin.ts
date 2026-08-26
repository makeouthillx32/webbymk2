import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdminClient } from "@/lib/require-admin";

// Tank's admin guard used to hand-roll its own profiles.role check against
// the RLS-bound client, duplicating (and drifting from) the shared guard in
// @/lib/require-admin — the exact pattern that caused the 2026-08-10
// invite-system privilege-escalation bug (see that file's header comment).
// Delegate the actual authorization decision to requireAdminClient (which
// reads role via the service-role client, so it isn't at the mercy of
// profiles RLS), then fetch display_name separately for the admin console UI.
export async function requireTankAdmin() {
  const supabase = await createClient();
  const access = await requireAdminClient(supabase);

  if (!access.ok) {
    redirect(
      access.status === 401
        ? "https://auth.unenter.live/sign-in?next=https%3A%2F%2Ftank.unenter.live%2Fadmin"
        : "/?error=access_denied",
    );
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, display_name")
    .eq("id", access.user.id)
    .single();

  return {
    user: access.user,
    profile: profile ?? { role: "admin", display_name: null },
  };
}
