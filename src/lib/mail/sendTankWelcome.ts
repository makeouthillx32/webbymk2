// lib/mail/sendTankWelcome.ts
// Fires whenever a profile gets a tank_profiles row — a fresh Tank signup,
// or an existing shop/labs account picking up a tank tag for the first
// time. Called from the tank-welcome webhook route, which the DB trigger
// on tank_profiles (AFTER INSERT) hits — see the researcher_opt_in_access
// migration's companion, tank_welcome_email_trigger.
import { createAdminClient } from "@/utils/supabase/admin";
import { sendMail } from "./client";
import { getMailIdentity, formatFrom } from "./identities";

export async function sendTankWelcomeEmail(userId: string): Promise<{ sent: boolean; reason?: string }> {
  const admin = createAdminClient();

  const [{ data: authUser }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("tank_profiles").select("display_name").eq("user_id", userId).maybeSingle(),
  ]);

  const email = authUser?.user?.email;
  if (!email) {
    return { sent: false, reason: "No email on account" };
  }

  const name = profile?.display_name || email.split("@")[0];
  const identity = getMailIdentity("tank");
  const subject = "Thanks for watching Tank";

  // Same warm amber-on-cream palette as the platform's default theme
  // (src/lib/mail/theme.ts's FALLBACK_PALETTE) — Tank doesn't have its own
  // stored theme_id to resolve, so this is hand-matched to it rather than
  // resolved dynamically, for the same look every recipient gets.
  const palette = {
    primary: "#b5561f",
    background: "#fbf8f4",
    card: "#f7f1e9",
    border: "#d4c4b0",
    foreground: "#2b2624",
    mutedForeground: "#666057",
  };

  const text = `Hey ${name},

Thanks for watching our tank — glad you're here.

Jump into the chat, pick a camera, and stick around: there's a lot more coming.

https://tank.unenter.live

— Tank`;

  const html = `
    <div style="background: ${palette.background}; padding: 32px 16px; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;">
      <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; border-collapse: collapse;">
        <tr>
          <td style="background: ${palette.primary}; border-radius: 12px 12px 0 0; padding: 20px 28px;">
            <span style="color: ${palette.background}; font-size: 13px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;">
              Tank
            </span>
          </td>
        </tr>
        <tr>
          <td style="background: ${palette.card}; border: 1px solid ${palette.border}; border-top: none; border-radius: 0 0 12px 12px; padding: 28px;">
            <h1 style="margin: 0 0 12px; font-size: 21px; color: ${palette.foreground}; font-weight: 700;">
              Thanks for watching, ${name}.
            </h1>
            <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: ${palette.foreground};">
              Glad you're here. Jump into the chat, pick a camera, and stick around —
              there's a lot more coming.
            </p>
            <a href="https://tank.unenter.live"
               style="display: inline-block; background: ${palette.primary}; color: ${palette.background};
                      padding: 11px 22px; border-radius: 8px; text-decoration: none;
                      font-weight: 600; font-size: 14px; margin-top: 4px;">
              Open Tank
            </a>
            <p style="margin: 24px 0 0; font-size: 12px; line-height: 1.5; color: ${palette.mutedForeground};">
              — Tank
            </p>
          </td>
        </tr>
      </table>
    </div>
  `;

  return sendMail({
    to: email,
    from: formatFrom(identity),
    replyTo: identity.mailbox,
    subject,
    html,
    text,
    credentials: identity.credentials,
  });
}
