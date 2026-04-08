"use client";

import { useEffect } from "react";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
import { getCookie, removeCookie } from "@/lib/cookieUtils"; // Adjust path as needed

export default function OAuthCallback() {
  const supabase = useSupabaseClient();

  useEffect(() => {
    (async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("OAuth session error:", sessionError.message);
        return;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const invite = urlParams.get("invite");

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (user && invite) {
        // 1. Attach invite to metadata (optional but good)
        await supabase.auth.updateUser({
          data: { invite },
        });

        // 2. Lookup the invite
        const { data: inviteData, error: inviteError } = await supabase
          .from("invites")
          .select("role_id")
          .eq("code", invite)
          .maybeSingle();

        if (!inviteError && inviteData?.role_id) {
          // 3. Update profile role
          await supabase
            .from("profiles")
            .update({ role: inviteData.role_id })
            .eq("id", user.id);

          // 4. Delete invite after use
          await supabase
            .from("invites")
            .delete()
            .eq("code", invite);
        }

        // 5. Clean up metadata (remove invite)
        await supabase.auth.updateUser({
          data: { invite: null },
        });
      }

      // 6. Get last page from cookie and redirect there
      const lastPage = getCookie('lastPage') || '/';
      
      // Clear the cookie after using it
      removeCookie('lastPage');
      
      // Exclude auth pages from redirect
      const excludedPages = ['/sign-in', '/sign-up', '/forgot-password'];
      const pageWithoutHash = lastPage.split('#')[0]; // Handle hash routes
      
      let redirectTo = lastPage;
      if (excludedPages.includes(pageWithoutHash)) {
        console.log(`[OAuth] Excluded page detected (${lastPage}), redirecting to /`);
        redirectTo = '/';
      }
      
      console.log(`[OAuth] Redirecting to: ${redirectTo}`);
      window.location.href = `${redirectTo}?refresh=true`;
    })();
  }, [supabase]);

  return (
    <p className="p-10 text-center text-sm text-gray-600 dark:text-gray-300">
      Completing&nbsp;sign‑in…
    </p>
  );
}