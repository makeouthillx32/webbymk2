// src/lib/mail/sendTankVerify.ts
// Sends the direct Tank LIVE email verification link modeled directly on
// the Fishtank LIVE confirmation format. Uses poste.io / Brevo SMTP via
// support@unenter.live.

import { sendMail } from "./client";
import { getMailIdentity, formatFrom } from "./identities";

export async function sendTankVerifyEmail({
  email,
  verifyUrl,
}: {
  email: string;
  verifyUrl: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!email?.trim()) {
    return { sent: false, reason: "No email provided" };
  }

  const identity = getMailIdentity("tank");
  const subject = "Confirm your signup to Tank LIVE";

  const text = `Hey,

Follow this link to verify your email address for Tank LIVE:

Verify Email Address: ${verifyUrl}

If you didn't sign up to Tank LIVE using this email address, you can ignore this email.

Tank LIVE`;

  const html = `
    <div style="background: #0f1117; padding: 40px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
      <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; border-collapse: collapse; background: #161a23; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <tr>
          <td style="padding: 24px 32px; border-bottom: 1px solid rgba(255,255,255,0.08); background: #12151c;">
            <span style="color: #ff4d00; font-size: 16px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase;">
              TANK LIVE
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding: 32px;">
            <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
              Hey,
            </p>
            <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
              Follow this link to verify your email address for Tank LIVE:
            </p>
            <div style="margin: 28px 0;">
              <a href="${verifyUrl}"
                 style="display: inline-block; background: #ff4d00; color: #ffffff;
                        padding: 14px 28px; border-radius: 6px; text-decoration: none;
                        font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 4px 12px rgba(255,77,0,0.3);">
                Verify Email Address
              </a>
            </div>
            <p style="margin: 28px 0 20px; font-size: 13px; line-height: 1.6; color: #94a3b8;">
              If you didn't sign up to Tank LIVE using this email address, you can ignore this email.
            </p>
            <p style="margin: 24px 0 0; font-size: 14px; font-weight: 700; color: #e2e8f0;">
              Tank LIVE
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
