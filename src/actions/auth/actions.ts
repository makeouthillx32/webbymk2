"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { encodedRedirect } from "@/utils/utils";
import { sendNotification } from "@/lib/notifications";
import { authLogger } from "@/lib/authLogger";

import type { ProfileUpsertRow } from "./types";
import { getAndClearLastPage, populateUserCookies, clearAuthCookies } from "./cookies";
import { CORE_DOMAIN } from "@/lib/multiZone";

const isBlockedAuthPath = (pathOnly: string): boolean =>
  pathOnly === "/sign-in" ||
  pathOnly === "/sign-up" ||
  pathOnly === "/forgot-password" ||
  pathOnly === "/reset-password" ||
  pathOnly.startsWith("/auth/");

const safeRedirectPath = (candidate: unknown): string | null => {
  if (typeof candidate !== "string" || !candidate) return null;

  // Same-origin relative path — original behavior.
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    const pathOnly = candidate.split("#")[0].split("?")[0];
    if (isBlockedAuthPath(pathOnly)) return null;
    return candidate;
  }

  // Cross-zone absolute URL. Sign-in only lives on the core zone, so a
  // visitor who hits "Add to Cart" unauthenticated on labs.unenter.live (or
  // any other zone) needs `next` to point back at that zone's URL, not a
  // same-origin path that would 404 on core. Restricted to *.unenter.live /
  // unenter.live so this can't become an open redirect.
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    const isOwnDomain = host === CORE_DOMAIN || host.endsWith(`.${CORE_DOMAIN}`);
    if (!isOwnDomain) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (isBlockedAuthPath(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
};

const safeOrigin = async (): Promise<string> => {
  const headerList = await headers();
  const origin = headerList.get("origin") || "";
  if (origin) return origin;
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.unenter.live").replace(/\/$/, "");
};

export const signUpAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString().trim() || "";
  const password = formData.get("password")?.toString() || "";
  const firstName = formData.get("first_name")?.toString().trim() || "";
  const lastName = formData.get("last_name")?.toString().trim() || "";
  const acceptedTerms = formData.get("accept_terms")?.toString() === "on";

  if (!email || !password) return encodedRedirect("error", "/sign-up", "Email and password are required.");
  if (!firstName || !lastName) return encodedRedirect("error", "/sign-up", "First and last name are required.");
  // Required — accepting this is what grants the "researcher" role that
  // gates research-compound checkout. No checkbox, no account.
  if (!acceptedTerms) {
    return encodedRedirect("error", "/sign-up", "You must accept the Terms of Service to create an account.");
  }

  const supabase = await createClient();
  const origin = await safeOrigin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback/oauth`,
      data: { first_name: firstName, last_name: lastName },
    },
  });

  if (error || !data.user) {
    console.error("[Auth] ❌ Sign up failed:", error?.message);
    return encodedRedirect("error", "/sign-up", error?.message || "Sign up failed.");
  }

  const userId = data.user.id;
  const displayName = `${firstName} ${lastName}`.trim();

  // ── Profile upsert ────────────────────────────────────────────
  // auth_user_id and email are required for role checks, order linkage,
  // admin UI, and the customers identity system.
  // role: "researcher" — accepting ToS at sign-up is what grants research-
  // checkout eligibility; see src/lib/research/requireResearcherRole.ts.
  const payload: ProfileUpsertRow = {
    id: userId,
    auth_user_id: userId, // ← same as id for email/password signups
    email: email.toLowerCase().trim(),
    role: "researcher",
    display_name: displayName,
    first_name: firstName,
    last_name: lastName,
    terms_accepted_at: new Date().toISOString(),
  };

  const { error: profileUpsertError } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (profileUpsertError) {
    console.error("[Auth] ❌ Profile upsert failed:", profileUpsertError.message);
    return encodedRedirect("error", "/sign-up", profileUpsertError.message);
  }

  // ── Customers upsert ──────────────────────────────────────────
  // Creates a customers row (type: member) so order history and
  // guest-order claiming work from day one.
  // Also handles the case where they previously ordered as a guest
  // with the same email — upgrades that row to member.
  try {
    const cookieStore = await cookies();
    const guestKey = cookieStore.get("unenter_guest_key")?.value ?? null;

    const { error: customerError } = await supabase
      .from("customers")
      .upsert(
        {
          auth_user_id: userId,
          email: email.toLowerCase().trim(),
          first_name: firstName,
          last_name: lastName,
          type: "member",
          guest_key: null, // members don't need a guest_key
          claimed_at: guestKey ? new Date().toISOString() : null,
        },
        { onConflict: "auth_user_id" } // unique index exists on auth_user_id
      );

    if (customerError) {
      // Non-fatal — profile is already created, don't block sign-up
      console.error("[Auth] ⚠️ Customers upsert failed:", customerError.message);
    } else {
      console.log("[Auth] ✅ Customers row upserted for new member:", userId);

      // If they had a guest_key cookie, backfill their past guest orders
      if (guestKey) {
        const { data: claimedCount, error: claimError } = await supabase.rpc(
          "claim_guest_orders",
          {
            p_auth_user_id: userId,
            p_email: email.toLowerCase().trim(),
            p_guest_key: guestKey,
          }
        );
        if (claimError) {
          console.error("[Auth] ⚠️ claim_guest_orders failed:", claimError.message);
        } else if (claimedCount > 0) {
          console.log(`[Auth] ✅ Claimed ${claimedCount} past guest order(s) for ${email}`);
        }
      }
    }
  } catch (err) {
    console.error("[Auth] ⚠️ Customers upsert threw:", err);
  }

  try {
    await sendNotification({
      title: `${email} signed up`,
      subtitle: "A new member account was created.",
      role_admin: true,
    });
  } catch (err) {
    console.error("[Auth] ⚠️ Notification failed:", err);
  }

  if (data.session) {
    authLogger.memberSignUp(userId, email, { firstName, lastName, source: "email_signup" });
    await populateUserCookies(userId, false);
    await new Promise((r) => setTimeout(r, 100));
    // Validated the same way sign-in validates it (safeRedirectPath) — an
    // unvalidated `lastPage` cookie value going straight into redirect() was
    // the likely cause of a client-side "unexpected response from the
    // server" exception seen right after a successful sign-up, 2026-08-06.
    // Fallback is "/" (home), never a dashboard route — the dashboard must
    // never be an implicit post-auth destination, only something you
    // deliberately navigate to. Fixed 2026-08-12.
    const lastPage = safeRedirectPath(await getAndClearLastPage()) ?? "/";
    // ✅ Append ?refresh=true so the client Provider immediately syncs the session
    const separator = lastPage.includes("?") ? "&" : "?";
    return redirect(`${lastPage}${separator}refresh=true`);
  }

  return encodedRedirect("success", "/sign-in", "Account created. Please check your email to verify, then sign in.");
};

export const signInAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString().trim() || "";
  const password = formData.get("password")?.toString() || "";
  const rememberValue = formData.get("remember")?.toString();
  const remember = rememberValue === "true" || rememberValue === "on";
  const nextPath = safeRedirectPath(formData.get("next"));

  console.log("[Auth] 🔐 Sign-in attempt:", { email, remember });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return encodedRedirect("error", "/sign-in", error.message);
  if (!data.user?.id) return encodedRedirect("error", "/sign-in", "Authentication failed");
  if (!data.session) return encodedRedirect("error", "/sign-in", "Session creation failed");

  authLogger.memberSignIn(data.user.id, data.user.email || "", remember);

  await populateUserCookies(data.user.id, remember);
  await new Promise((r) => setTimeout(r, 100));

  // Fallback is "/" — see signUpAction above for why this must never be a
  // dashboard route.
  const lastPage = nextPath ?? safeRedirectPath(await getAndClearLastPage()) ?? "/";
  // ✅ Append ?refresh=true so the client Provider immediately syncs the session
  const separator = lastPage.includes("?") ? "&" : "?";
  return redirect(`${lastPage}${separator}refresh=true`);
};

/**
 * Called by the client-side sign-in form AFTER signInWithPassword() succeeds
 * in the browser. We can't do this from the client directly because it needs
 * server-side cookie access to write userRole, userDisplayName, etc.
 *
 * Does NOT redirect — the caller handles navigation.
 */
export const populateCookiesAction = async (userId: string, remember: boolean) => {
  authLogger.memberSignIn(userId, "", remember);
  await populateUserCookies(userId, remember);
};

export const forgotPasswordAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString()?.trim();
  const callbackUrl = formData.get("callbackUrl")?.toString();

  if (!email) return encodedRedirect("error", "/forgot-password", "Email is required");

  const supabase = await createClient();
  const origin = await safeOrigin();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirect_to=/protected/reset-password`,
  });

  if (error) return encodedRedirect("error", "/forgot-password", "Could not reset password");

  if (callbackUrl) return redirect(callbackUrl);
  return encodedRedirect("success", "/forgot-password", "Check your email for a link to reset your password.");
};

export const resetPasswordAction = async (formData: FormData) => {
  const password        = formData.get("password")?.toString();
  const confirmPassword = formData.get("confirmPassword")?.toString();

  if (!password || !confirmPassword) {
    return encodedRedirect("error", "/reset-password", "Password and confirm password are required");
  }
  if (password !== confirmPassword) {
    return encodedRedirect("error", "/reset-password", "Passwords do not match");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return encodedRedirect("error", "/reset-password", error.message);
  }

  return encodedRedirect("success", "/sign-in", "Password updated — please sign in with your new password.");
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearAuthCookies();
  return redirect("/");
};
