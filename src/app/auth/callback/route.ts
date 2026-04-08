// app/auth/callback/route.ts
// Handles both OAuth sign-in callbacks AND password reset email links.
// Supabase sends a ?code= param; we exchange it for a session, then redirect.
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const urlInvite = requestUrl.searchParams.get("invite");
  const redirectTo = requestUrl.searchParams.get("redirect_to") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[auth/callback] ❌ exchangeCodeForSession failed:", error.message);
      return NextResponse.redirect(
        new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
      );
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const userId = user.id;
      const metaInvite = user.user_metadata?.invite;
      const inviteCode = metaInvite || urlInvite;

      // ✅ Ensure profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (!existingProfile) {
        await supabase.from("profiles").insert({
          id: userId,
          role: "anonymous",
        });
      }

      // ✅ Apply invite if present
      if (inviteCode) {
        const { data: invite, error: inviteError } = await supabase
          .from("invites")
          .select("role_id")
          .eq("code", inviteCode)
          .maybeSingle();

        if (!inviteError && invite?.role_id) {
          await supabase
            .from("profiles")
            .update({ role: invite.role_id })
            .eq("id", userId);

          await supabase.from("invites").delete().eq("code", inviteCode);
        }
      }

      // ✅ Set display name if missing
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();

      if (!profile?.display_name) {
        const defaultName = user.email?.split("@")[0];
        if (defaultName) {
          await supabase
            .from("profiles")
            .update({ display_name: defaultName })
            .eq("id", userId);
        }
      }

      // ✅ Clean up invite metadata
      if (metaInvite) {
        await supabase.auth.updateUser({ data: { invite: null } });
      }
    }
  }

  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin));
}