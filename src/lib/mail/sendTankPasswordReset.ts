// src/lib/mail/sendTankPasswordReset.ts
// ─────────────────────────────────────────────────────────────────────────────
// The Tank LIVE password reset.
//
// Recovery started from Tank used to call supabase.auth.resetPasswordForEmail()
// with no redirect, which sends GoTrue's OWN default template from
// unenter.live and drops the person on the core site. A viewer who only knows
// Tank got an email from a domain they have never heard of, telling them to
// reset "your user" — indistinguishable from a phishing attempt.
//
// The account IS one platform account; that part is real and the copy says so.
// But the email arrives from Tank, wearing Tank's console furniture, and lands
// on a Tank page. Same chassis as sendTankVerify — see that file for why every
// textured cell carries a solid bgcolor and why the header font is a fallback
// stack rather than the real Highway Gothic.
// ─────────────────────────────────────────────────────────────────────────────

import { sendMail } from "./client";
import { getMailIdentity, formatFrom } from "./identities";

const ASSETS =
  "https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images";

const METAL = `${ASSETS}/metal-small-comp.webp`;
const SCREW_TL = `${ASSETS}/screw-top-left.png`;
const SCREW_TR = `${ASSETS}/screw-top-right.png`;
const SCREW_BL = `${ASSETS}/screw-bottom-left.png`;
const SCREW_BR = `${ASSETS}/screw-bottom-right.png`;

const HEAD_FONT =
  "'Arial Narrow', 'Haettenschweiler', 'Franklin Gothic Bold', Impact, Arial, sans-serif";
const BODY_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const INK = "#f2f4f5";
const INK_MUTED = "#a9b2b7";
const ORANGE = "#ff4d00";
const PLATE = "#2b2f33";
const VOID_BG = "#0a0a0b";

const screw = (src: string, align: "left" | "right") =>
  `<td width="26" align="${align}" valign="middle" style="padding:0 6px;">` +
  `<img src="${src}" width="14" height="14" alt="" style="display:block;border:0;width:14px;height:14px;" />` +
  `</td>`;

export function buildTankResetEmailHtml(resetUrl: string): string {
  return `
<div style="background:${VOID_BG};padding:36px 16px;font-family:${BODY_FONT};color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="max-width:520px;margin:0 auto;border-collapse:collapse;">
    <tr>
      <td bgcolor="${PLATE}" background="${METAL}"
          style="background-color:${PLATE};background-image:url('${METAL}');background-repeat:repeat;
                 border:1px solid #000000;border-bottom:none;border-radius:6px 6px 0 0;padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            ${screw(SCREW_TL, "left")}
            <td align="center" style="padding:18px 4px;">
              <span style="font-family:${HEAD_FONT};font-size:22px;font-weight:700;letter-spacing:0.18em;
                           text-transform:uppercase;color:${INK};text-shadow:0 1px 2px rgba(0,0,0,0.85);">
                Tank<span style="color:${ORANGE};">&nbsp;Live</span>
              </span>
            </td>
            ${screw(SCREW_TR, "right")}
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td bgcolor="#141416"
          style="background-color:#141416;border:1px solid #000000;border-top:none;border-bottom:none;padding:30px 32px;">
        <p style="margin:0 0 6px;font-family:${HEAD_FONT};font-size:13px;font-weight:700;
                  letter-spacing:0.16em;text-transform:uppercase;color:${ORANGE};">
          Reset your password
        </p>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:${INK};">
          Someone asked to reset the password for this address. If that was you, set a new one here.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
          <tr>
            <td bgcolor="${ORANGE}" align="center"
                style="background-color:${ORANGE};border-radius:5px;border:1px solid #7a2500;">
              <a href="${resetUrl}"
                 style="display:inline-block;padding:14px 30px;font-family:${HEAD_FONT};font-size:15px;
                        font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#ffffff;
                        text-decoration:none;text-shadow:0 1px 1px rgba(0,0,0,0.4);">
                Set a new password
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:${INK_MUTED};">
          Your Tank login is the same account you use across unenter.live, so this changes
          the password everywhere — but you only ever need it here to get back into Tank.
        </p>

        <p style="margin:0 0 4px;font-size:11px;color:#6b7280;">
          Button not working? Paste this into your browser:
        </p>
        <p style="margin:0;font-size:11px;line-height:1.5;word-break:break-all;">
          <a href="${resetUrl}" style="color:${ORANGE};text-decoration:underline;">${resetUrl}</a>
        </p>
      </td>
    </tr>

    <tr>
      <td bgcolor="${PLATE}" background="${METAL}"
          style="background-color:${PLATE};background-image:url('${METAL}');background-repeat:repeat;
                 border:1px solid #000000;border-top:none;border-radius:0 0 6px 6px;padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            ${screw(SCREW_BL, "left")}
            <td align="center" style="padding:14px 4px;">
              <span style="font-size:11px;line-height:1.5;color:${INK_MUTED};text-shadow:0 1px 2px rgba(0,0,0,0.8);">
                Didn't ask for this? Ignore it — your password stays as it is.
              </span>
            </td>
            ${screw(SCREW_BR, "right")}
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
}

export async function sendTankPasswordResetEmail({
  email,
  resetUrl,
}: {
  email: string;
  resetUrl: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!email?.trim()) {
    return { sent: false, reason: "No email provided" };
  }

  const identity = getMailIdentity("tank");

  const text = `TANK LIVE — reset your password

Someone asked to reset the password for this address. If that was you, set a
new one here:

${resetUrl}

Your Tank login is the same account you use across unenter.live, so this
changes the password everywhere — but you only ever need it here to get back
into Tank.

Didn't ask for this? Ignore it — your password stays as it is.

— Tank`;

  return sendMail({
    to: email,
    from: formatFrom(identity),
    replyTo: identity.mailbox,
    subject: "Reset your Tank LIVE password",
    html: buildTankResetEmailHtml(resetUrl),
    text,
    credentials: identity.credentials,
  });
}
