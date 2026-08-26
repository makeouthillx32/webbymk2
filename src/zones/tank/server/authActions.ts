"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { sendTankVerifyEmail } from "@/lib/mail/sendTankVerify";

export type SignUpResult = {
  success: boolean;
  message?: string;
  error?: string;
  needsVerification?: boolean;
  /**
   * True when this email already had a confirmed unenter account — from the
   * shop, labs, or anywhere else on the platform. Auth is shared across every
   * zone, so arriving at Tank is a promotion, not a new registration, and
   * asking them to re-verify an address they already verified is wrong.
   */
  alreadyMember?: boolean;
};

type ExistingAuthUser = {
  userId: string;
  isConfirmed: boolean;
  provider: string;
};

/**
 * Looks up an existing account by email, via a single indexed query.
 *
 * Deliberately not admin.auth.admin.listUsers(): that pages at 50, so past the
 * first page an existing member is simply not found and gets told to verify an
 * account they already verified.
 */
async function findExistingAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<ExistingAuthUser | null> {
  try {
    const { data, error } = await admin.rpc("tank_lookup_auth_user", { p_email: email });
    if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.user_id) return null;
    return {
      userId: row.user_id,
      isConfirmed: Boolean(row.is_confirmed),
      provider: row.provider || "email",
    };
  } catch {
    return null;
  }
}

/**
 * Gives an existing platform account its Tank-side rows.
 *
 * Someone who signed up on the shop has an auth user but no tank_profiles row,
 * so Tank would treat them as a stranger. This is the whole "promotion": no new
 * account, no new password, no second verification — just the profile rows Tank
 * needs to recognise them.
 */
export async function promoteExistingUserToTank(
  userId: string,
  email: string,
): Promise<void> {
  const admin = createAdminClient();
  const cleanEmail = email.trim().toLowerCase();
  await Promise.all([
    admin.from("profiles").upsert(
      { id: userId, auth_user_id: userId, email: cleanEmail, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    ),
    admin.from("tank_profiles").upsert(
      {
        user_id: userId,
        email_verified: true,
        verified_via: "platform_auth",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    ),
  ]);
}

/**
 * Registers a new user for Tank LIVE with email verification link.
 * Directs verification to the Auth zone (/auth/verify).
 * Uses poste.io / Brevo SMTP to deliver the verification email.
 */
export async function registerTankUser({
  email,
  password,
  displayName,
  origin,
}: {
  email: string;
  password?: string;
  displayName?: string;
  origin?: string;
}): Promise<SignUpResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) {
    return { success: false, error: "Email address is required." };
  }

  const name = displayName?.trim() || trimmedEmail.split("@")[0];
  // Direct verification link to Auth zone
  const redirectTarget = "https://unenter.live/auth/verify";

  try {
    const admin = createAdminClient();

    // 0. Is this address already an unenter account?
    //
    // Auth is shared across every zone — shop, labs, research, core. Someone
    // who bought something on the shop and then lands on Tank has no reason to
    // think of themselves as "new", and they are not: they already own a
    // verified account. Re-verifying an address they verified months ago is
    // both pointless and a dead end, because generateLink({type:"signup"})
    // fails for an existing user, so the old code left them stuck on a verify
    // screen for an email that never arrived.
    const existing = await findExistingAuthUser(admin, trimmedEmail);

    if (existing?.isConfirmed) {
      // Promotion, not registration: give them their Tank rows and send them
      // to sign-in. No email, no second verification.
      await promoteExistingUserToTank(existing.userId, trimmedEmail);
      return {
        success: true,
        needsVerification: false,
        alreadyMember: true,
        message: "You already have an unenter account — sign in and you're straight into Tank.",
      };
    }

    if (existing && !existing.isConfirmed) {
      // A real half-finished signup. Resending is the right move, but it must
      // be a resend rather than a fresh signup link, which would error.
      const resend = await resendTankVerification({ email: trimmedEmail, origin });
      return {
        success: resend.success,
        needsVerification: true,
        error: resend.success ? undefined : resend.error,
        message: resend.success
          ? `Verification email re-sent to ${trimmedEmail}.`
          : undefined,
      };
    }

    // 1. Genuinely new. Generate direct signup confirmation link
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "signup",
      email: trimmedEmail,
      password: password || undefined,
      options: {
        redirectTo: redirectTarget,
        data: {
          display_name: name,
          tags: ["tank", "unenter_auth"],
        },
      },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      return {
        success: false,
        error: linkErr?.message || "Failed to generate account verification link.",
      };
    }

    const verifyUrl = linkData.properties.action_link;

    // 2. Dispatch custom Tank branded verification email
    const mailRes = await sendTankVerifyEmail({
      email: trimmedEmail,
      verifyUrl,
    });

    if (!mailRes.sent) {
      console.warn("[TankAuth] Verification email dispatch warning:", mailRes.reason);
    }

    return {
      success: true,
      needsVerification: true,
      message: `Verification email sent to ${trimmedEmail}.`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to register account.",
    };
  }
}

/**
 * Resends the verification email for an unconfirmed account.
 */
export async function resendTankVerification({
  email,
}: {
  email: string;
  origin?: string;
}): Promise<SignUpResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) {
    return { success: false, error: "Email address is required." };
  }

  const redirectTarget = "https://unenter.live/auth/verify";

  try {
    const admin = createAdminClient();

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: trimmedEmail,
      options: {
        redirectTo: redirectTarget,
      },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      return {
        success: false,
        error: linkErr?.message || "Failed to generate verification link.",
      };
    }

    await sendTankVerifyEmail({
      email: trimmedEmail,
      verifyUrl: linkData.properties.action_link,
    });

    return {
      success: true,
      message: `Verification link resent to ${trimmedEmail}.`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to resend verification link.",
    };
  }
}

/**
 * Checks whether an account's email has been confirmed in Supabase Auth.
 */
export async function checkEmailVerified(email: string): Promise<{ verified: boolean; userId?: string }> {
  try {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return { verified: false };

    const admin = createAdminClient();
    // Indexed lookup rather than listUsers(), which pages at 50 — this is the
    // poller behind the verify screen, so a miss here means a user who HAS
    // verified sits on a spinner forever.
    const existing = await findExistingAuthUser(admin, trimmedEmail);
    if (!existing) return { verified: false };
    return { verified: existing.isConfirmed, userId: existing.userId };
  } catch {
    return { verified: false };
  }
}

/**
 * Broadcasts verification completion across Realtime channel.
 */
export async function broadcastVerificationSuccess(email: string, userId: string) {
  try {
    const admin = createAdminClient();
    const cleanEmail = email.trim().toLowerCase();

    // Ensure profiles and tank_profiles exist and are tagged
    await Promise.all([
      admin.from("profiles").upsert(
        {
          id: userId,
          auth_user_id: userId,
          email: cleanEmail,
          role: "member",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      ),
      admin.from("tank_profiles").upsert(
        {
          user_id: userId,
          email_verified: true,
          verified_via: "platform_auth",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      ),
    ]);

    const channel = admin.channel(`tank:auth:verified:${cleanEmail}`);
    await channel.send({
      type: "broadcast",
      event: "account_verified",
      payload: { email: cleanEmail, userId, timestamp: Date.now() },
    });
  } catch (err) {
    console.warn("[TankAuth] Broadcast error:", err);
  }
}
