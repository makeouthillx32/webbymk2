"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { encodedRedirect } from "@/utils/utils";
import { sendNotification } from "@/lib/notifications";
import { authLogger } from "@/lib/authLogger";

import type { ProfileUpsertRow } from "./types";
import { getAndClearLastPage, populateUserCookies, clearAuthCookies } from "./cookies";

const safeOrigin = async (): Promise<string> => {
  const headerList = await headers();
  const origin = headerList.get("origin") || "";
  if (origin) return origin;
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://desertcowgirl.co").replace(/\/$/, "");
};

export const signUpAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString().trim() || "";
  const password = formData.get("password")?.toString() || "";
  const firstName = formData.get("first_name")?.toString().trim() || "";
  const lastName = formData.get("last_name")?.toString().trim() || "";

  if (!email || !password) return encodedRedirect("error", "/sign-up", "Email and password are required.");
  if (!firstName || !lastName) return encodedRedirect("error", "/sign-up", "First and last name are required.");

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
  const payload: ProfileUpsertRow = {
    id: userId,
    auth_user_id: userId, // ← same as id for email/password signups
    email: email.toLowerCase().trim(),
    role: "member",
    display_name: displayName,
    first_name: firstName,
    last_name: lastName,
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
    const guestKey = cookieStore.get("dcg_guest_key")?.value ?? null;

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
    await sendNotification({ title: `${email} signed up`, role_admin: true });
  } catch (err) {
    console.error("[Auth] ⚠️ Notification failed:", err);
  }

  if (data.session) {
    authLogger.memberSignUp(userId, email, { firstName, lastName, source: "email_signup" });
    await populateUserCookies(userId, false);
    await new Promise((r) => setTimeout(r, 100));
    const lastPage = await getAndClearLastPage();
    // ✅ Append ?refresh=true so the client Provider immediately syncs the session
    const separator = lastPage.includes("?") ? "&" : "?";
    return redirect(`${lastPage}${separator}refresh=true`);
  }

  return encodedRedirect("success", "/sign-in", "Account created. Please check your email to verify, then sign in.");
};

export const signInAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString().trim() || "";
  const password = formData.get("password")?.toString() || "";
  const remember = formData.get("remember") === "true";

  console.log("[Auth] 🔐 Sign-in attempt:", { email, remember });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return encodedRedirect("error", "/sign-in", error.message);
  if (!data.user?.id) return encodedRedirect("error", "/sign-in", "Authentication failed");
  if (!data.session) return encodedRedirect("error", "/sign-in", "Session creation failed");

  authLogger.memberSignIn(data.user.id, data.user.email || "", remember);

  await populateUserCookies(data.user.id, remember);
  await new Promise((r) => setTimeout(r, 100));

  const lastPage = await getAndClearLastPage();
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