"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
import { getCookie, removeCookie } from "@/lib/cookieUtils";
import { isLastPageExcluded } from "@/lib/protectedRoutes";

export default function OAuthCallback() {
  const supabase = useSupabaseClient();
  const [showTos, setShowTos] = useState(false);
  const [tosChecked, setTosChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const finishRedirect = () => {
    const lastPage = getCookie("lastPage") || "/";
    removeCookie("lastPage");

    // Single shared exclusion list (src/lib/protectedRoutes.ts) — never
    // redirect back into an auth page (loop) or a protected-prefix route
    // like /dashboard, which must only ever be reached by deliberate
    // navigation, not an implicit post-auth landing spot. Fixed 2026-08-12.
    const redirectTo = isLastPageExcluded(lastPage) ? "/" : lastPage;

    console.log(`[OAuth] Redirecting to: ${redirectTo}`);
    const separator = redirectTo.includes("?") ? "&" : "?";
    window.location.href = `${redirectTo}${separator}refresh=true`;
  };

  useEffect(() => {
    (async () => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("OAuth session error:", sessionError.message);
        finishRedirect();
        return;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const invite = urlParams.get("invite");

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        finishRedirect();
        return;
      }

      let inviteApplied = false;

      if (invite) {
        // 1. Attach invite to metadata (optional but good)
        await supabase.auth.updateUser({ data: { invite } });

        // 2. Lookup the invite
        const { data: inviteData, error: inviteError } = await supabase
          .from("invites")
          .select("role_id")
          .eq("code", invite)
          .maybeSingle();

        if (!inviteError && inviteData?.role_id) {
          // 3. Update profile role
          await supabase.from("profiles").update({ role: inviteData.role_id }).eq("id", user.id);

          // 4. Delete invite after use
          await supabase.from("invites").delete().eq("code", invite);

          inviteApplied = true;
        }

        // 5. Clean up metadata (remove invite)
        await supabase.auth.updateUser({ data: { invite: null } });
      }

      // The handle_new_user DB trigger inserts a profiles row with
      // role='member' the instant auth.users gets a row — including OAuth
      // sign-ins — so by the time this code runs a profile always already
      // exists. An invite (above) can already upgrade that role. Otherwise,
      // a first-time OAuth sign-in still needs the same Terms-of-Service
      // acceptance email/password sign-up requires before being promoted to
      // 'researcher' — without this step every Google/Apple/Facebook sign-up
      // would silently stay a plain 'member' forever, with no research-
      // checkout access and no consent on file. Fixed 2026-08-12.
      if (!inviteApplied) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("terms_accepted_at")
          .eq("id", user.id)
          .maybeSingle();

        if (!profile?.terms_accepted_at) {
          setPendingUserId(user.id);
          setShowTos(true);
          return; // blocked here — finishRedirect() runs after acceptance
        }
      }

      finishRedirect();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const acceptTerms = async () => {
    if (!pendingUserId || !tosChecked) return;
    setSubmitting(true);
    try {
      // .eq("role", "member") is a belt-and-suspenders guard — never
      // downgrade or override an existing elevated role (admin/researcher/
      // affiliate) that might already be set by some other path by the time
      // this fires.
      const { error } = await supabase
        .from("profiles")
        .update({ role: "researcher", terms_accepted_at: new Date().toISOString() })
        .eq("id", pendingUserId)
        .eq("role", "member");

      if (error) console.error("Failed to record ToS acceptance:", error.message);
    } catch (err) {
      console.error("Failed to record ToS acceptance:", err);
    } finally {
      finishRedirect();
    }
  };

  if (showTos) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-[var(--shadow-lg)]">
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))] font-[var(--font-sans)]">
            One last step
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))] font-[var(--font-sans)]">
            Before you continue, please accept our Terms of Service and Privacy Policy —
            including the research-use terms required to purchase research compounds.
          </p>

          <div className="mt-4 flex items-start gap-2.5">
            <input
              id="oauth_accept_terms"
              type="checkbox"
              checked={tosChecked}
              onChange={(e) => setTosChecked(e.target.checked)}
              className="mt-0.5"
            />
            <label
              htmlFor="oauth_accept_terms"
              className="text-xs font-normal leading-relaxed text-[hsl(var(--muted-foreground))] font-[var(--font-sans)]"
            >
              I agree to the{" "}
              <Link
                href="/terms"
                target="_blank"
                className="underline hover:text-[hsl(var(--sidebar-primary))] transition-colors duration-200"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                target="_blank"
                className="underline hover:text-[hsl(var(--sidebar-primary))] transition-colors duration-200"
              >
                Privacy Policy
              </Link>
              .
            </label>
          </div>

          <button
            type="button"
            disabled={!tosChecked || submitting}
            onClick={acceptTerms}
            className="mt-5 w-full rounded-[var(--radius)] bg-[hsl(var(--primary))] py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] shadow-[var(--shadow-sm)] transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Continuing…" : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <p className="p-10 text-center text-sm text-gray-600 dark:text-gray-300">
      Completing&nbsp;sign‑in…
    </p>
  );
}
