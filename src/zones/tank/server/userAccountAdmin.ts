"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

// Staff account tools for the House console: verify, un-verify, create, and
// send a password reset.
//
// EVERY FUNCTION HERE IS ADMIN-ONLY AND AUDITED, because each one is a way to
// take over an account:
//
//  - marking an email verified asserts something nobody proved — that the
//    person controls that inbox
//  - creating a pre-verified user mints an account with no email round-trip
//  - a password reset sends real mail to a real person
//
// Moderators deliberately cannot reach any of it; the console hides the
// controls, and requireAdmin below is what actually enforces it.

export type AccountActionResult = { success: boolean; error?: string };

/** Emails we will never act on, whatever the console sends. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type AdminCheck = { actorId: string | null; error?: string };

async function requireAdmin(): Promise<AdminCheck> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { actorId: null, error: "You must be signed in." };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return { actorId: null, error: "Admin clearance required." };
  }
  return { actorId: user.id };
}

/**
 * Record the action.
 *
 * Best-effort on purpose: a failed audit write must not roll back a change the
 * operator has already seen succeed. It is logged loudly instead, because an
 * audit trail that silently stops is worse than one that is obviously broken.
 */
async function audit(
  actorId: string,
  action: string,
  entityId: string | null,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("admin_audit_log").insert({
      actor_auth_user_id: actorId,
      action,
      entity_type: "auth_user",
      entity_id: entityId,
      meta,
    });
    if (error) console.error(`[TankAccountAdmin] audit write failed: ${error.message}`);
  } catch (error) {
    console.error("[TankAccountAdmin] audit write threw", error);
  }
}

/**
 * Mark an account's email verified, or take that back.
 *
 * Goes through tank_set_email_verified rather than the admin API because GoTrue
 * can confirm an address but has no supported way to un-confirm one.
 */
export async function setUserEmailVerified(
  targetUserId: string,
  verified: boolean,
): Promise<AccountActionResult> {
  const auth = await requireAdmin();
  if (!auth.actorId) return { success: false, error: auth.error };
  if (!targetUserId?.trim()) return { success: false, error: "Missing target user." };

  // Un-verifying yourself would lock you out of the console you are standing in.
  if (targetUserId === auth.actorId && !verified) {
    return { success: false, error: "You cannot un-verify your own account." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("tank_set_email_verified", {
    target_user_id: targetUserId,
    verified,
  });

  if (error) return { success: false, error: error.message };
  if (data === false) return { success: false, error: "No such user." };

  await audit(auth.actorId, verified ? "email_verified_manually" : "email_unverified", targetUserId, {
    verified,
  });
  return { success: true };
}

/**
 * Create an account from the console.
 *
 * `sendInvite` decides which of two very different things happens:
 *   - false: the account is created already verified with the password given,
 *     and nothing is emailed. For making an account on someone's behalf.
 *   - true: an invite email goes out and the person sets their own password.
 *     No password is stored by staff, which is the better default for a real
 *     person's account.
 */
export async function createTankUser(input: {
  email: string;
  password?: string;
  displayName?: string;
  sendInvite?: boolean;
}): Promise<AccountActionResult & { userId?: string }> {
  const auth = await requireAdmin();
  if (!auth.actorId) return { success: false, error: auth.error };

  const email = (input.email || "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return { success: false, error: "That is not a valid email." };

  const admin = createAdminClient();
  const displayName = (input.displayName || "").trim() || email.split("@")[0];

  if (input.sendInvite) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { display_name: displayName },
    });
    if (error) return { success: false, error: error.message };
    await audit(auth.actorId, "user_invited", data.user?.id ?? null, { email });
    return { success: true, userId: data.user?.id };
  }

  const password = input.password || "";
  // Short passwords are rejected here rather than left to GoTrue, whose error
  // text is not something an operator should have to interpret mid-shift.
  if (password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) return { success: false, error: error.message };

  await audit(auth.actorId, "user_created_manually", data.user?.id ?? null, {
    email,
    preVerified: true,
  });
  return { success: true, userId: data.user?.id };
}

/**
 * Send a password reset.
 *
 * THIS SENDS REAL MAIL TO A REAL PERSON, so it is a deliberate per-user action
 * and never part of a bulk operation. The console asks before calling it.
 *
 * redirectTo is pinned to the core site rather than derived from the request
 * origin: the House console runs on tank.unenter.live, and a reset link
 * pointing at an origin GoTrue does not allow-list gets silently rewritten back
 * to SITE_URL — which is how a reset lands somewhere that cannot complete it.
 */
export async function sendPasswordResetEmail(
  email: string,
): Promise<AccountActionResult> {
  const auth = await requireAdmin();
  if (!auth.actorId) return { success: false, error: auth.error };

  const target = (email || "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(target)) return { success: false, error: "That is not a valid email." };

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.unenter.live").replace(
    /\/$/,
    "",
  );

  const admin = createAdminClient();
  const { error } = await admin.auth.resetPasswordForEmail(target, {
    redirectTo: `${siteUrl}/auth/callback?redirect_to=/protected/reset-password`,
  });
  if (error) return { success: false, error: error.message };

  await audit(auth.actorId, "password_reset_sent", null, { email: target });
  return { success: true };
}

/**
 * Re-send the signup confirmation to someone stuck unverified.
 *
 * The case this exists for: a viewer signs up, the confirmation never arrives or
 * the link fails, and they say so in chat. Without this the only options are
 * verifying them manually — which proves nothing about the inbox — or deleting
 * the account so they can start over.
 */
export async function resendVerificationEmail(
  email: string,
): Promise<AccountActionResult> {
  const auth = await requireAdmin();
  if (!auth.actorId) return { success: false, error: auth.error };

  const target = (email || "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(target)) return { success: false, error: "That is not a valid email." };

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.unenter.live").replace(
    /\/$/,
    "",
  );

  const admin = createAdminClient();
  const { error } = await admin.auth.resend({
    type: "signup",
    email: target,
    options: { emailRedirectTo: `${siteUrl}/auth/callback/oauth` },
  });
  if (error) return { success: false, error: error.message };

  await audit(auth.actorId, "verification_email_resent", null, { email: target });
  return { success: true };
}
