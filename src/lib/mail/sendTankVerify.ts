// src/lib/mail/sendTankVerify.ts
// ─────────────────────────────────────────────────────────────────────────────
// The Tank LIVE email verification.
//
// THIS EMAIL IS TANK'S, NOT UNENTER'S. Auth is shared across every zone — shop,
// labs, blog, core — but a person signing up from the stream has never heard of
// unenter.live and has no reason to. Seeing core branding on a Tank signup reads
// as a phishing attempt, not a platform. Tank's palette, Tank's console
// furniture, every time.
//
// ── EMAIL CLIENT CONSTRAINTS, because they shape every choice below ─────────
//
//  · Webfonts do not load. The Tank faces (Highway Gothic, Alarm Clock) are
//    fetched from Supabase and email clients drop @font-face entirely, so the
//    header uses an industrial fallback stack that is CLOSE in weight and width
//    rather than pretending the real face will arrive.
//  · The metal texture is WebP. Gmail renders it; Outlook does not. Every
//    textured cell carries a solid `bgcolor` underneath, so the worst case is
//    flat Tank-dark rather than a white hole.
//  · The corner screws are PNG and render everywhere — which is why the console
//    plate look leans on THEM rather than on the texture.
//  · No gradients, no flexbox, no external stylesheet. Tables and inline styles.
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

/** Industrial stack. Closest widely-installed match to Highway Gothic's weight. */
const HEAD_FONT =
  "'Arial Narrow', 'Haettenschweiler', 'Franklin Gothic Bold', Impact, Arial, sans-serif";
const BODY_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const INK = "#f2f4f5";
const INK_MUTED = "#a9b2b7";
const ORANGE = "#ff4d00";
const PLATE = "#2b2f33";
const VOID_BG = "#0a0a0b";

/** A 14px screw, as its own cell. Kept small so it reads as hardware, not art. */
const screw = (src: string, align: "left" | "right") =>
  `<td width="26" align="${align}" valign="middle" style="padding:0 6px;">` +
  `<img src="${src}" width="14" height="14" alt="" style="display:block;border:0;width:14px;height:14px;" />` +
  `</td>`;

/**
 * The markup, exported so it can be rendered and looked at.
 *
 * Sending mail to a real person is the only other way to see this, and that is
 * a bad review loop — the previous version of this email went out to a live
 * signup wearing the wrong brand entirely before anyone noticed.
 */
export function buildTankVerifyEmailHtml(secureVerifyUrl: string): string {
  return `
<div style="background:${VOID_BG};padding:36px 16px;font-family:${BODY_FONT};color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="max-width:520px;margin:0 auto;border-collapse:collapse;">

    <!-- Console plate header: metal texture, screws, TANK LIVE -->
    <tr>
      <td bgcolor="${PLATE}" background="${METAL}"
          style="background-color:${PLATE};background-image:url('${METAL}');background-repeat:repeat;
                 border:1px solid #000000;border-bottom:none;border-radius:6px 6px 0 0;padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border-collapse:collapse;">
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

    <!-- Body -->
    <tr>
      <td bgcolor="#141416"
          style="background-color:#141416;border:1px solid #000000;border-top:none;border-bottom:none;padding:30px 32px;">
        <p style="margin:0 0 6px;font-family:${HEAD_FONT};font-size:13px;font-weight:700;
                  letter-spacing:0.16em;text-transform:uppercase;color:${ORANGE};">
          Verify your email
        </p>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:${INK};">
          One click and you're in. This confirms the address, nothing else.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
          <tr>
            <td bgcolor="${ORANGE}" align="center"
                style="background-color:${ORANGE};border-radius:5px;border:1px solid #7a2500;">
              <a href="${secureVerifyUrl}"
                 style="display:inline-block;padding:14px 30px;font-family:${HEAD_FONT};font-size:15px;
                        font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#ffffff;
                        text-decoration:none;text-shadow:0 1px 1px rgba(0,0,0,0.4);">
                Verify Email Address
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:${INK_MUTED};">
          Once it's verified you can close that tab — the Tank window you signed up in
          unlocks by itself, no password needed twice.
        </p>

        <!-- Plain-text fallback for clients that mangle the button. -->
        <p style="margin:0 0 4px;font-size:11px;color:#6b7280;">
          Button not working? Paste this into your browser:
        </p>
        <p style="margin:0;font-size:11px;line-height:1.5;word-break:break-all;">
          <a href="${secureVerifyUrl}" style="color:${ORANGE};text-decoration:underline;">${secureVerifyUrl}</a>
        </p>
      </td>
    </tr>

    <!-- Footer plate -->
    <tr>
      <td bgcolor="${PLATE}" background="${METAL}"
          style="background-color:${PLATE};background-image:url('${METAL}');background-repeat:repeat;
                 border:1px solid #000000;border-top:none;border-radius:0 0 6px 6px;padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border-collapse:collapse;">
          <tr>
            ${screw(SCREW_BL, "left")}
            <td align="center" style="padding:14px 4px;">
              <span style="font-size:11px;line-height:1.5;color:${INK_MUTED};text-shadow:0 1px 2px rgba(0,0,0,0.8);">
                Didn't sign up to Tank? Ignore this and nothing happens.
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

  // Upstream (toPublicAuthUrl in authActions) already normalises host and
  // scheme. Kept as a last line of defence for any other caller: a link that
  // reaches an inbox pointing at an internal host is unopenable, and that
  // failure cost two real signups before it was traced.
  const secureVerifyUrl = (() => {
    try {
      const link = new URL(verifyUrl);
      const target = new URL(
        process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || "https://db.unenter.live",
      );
      link.protocol = target.protocol;
      link.host = target.host;
      return link.toString();
    } catch {
      return verifyUrl;
    }
  })();

  const identity = getMailIdentity("tank");
  const subject = "Confirm your signup to Tank LIVE";

  const text = `TANK LIVE — verify your email

Follow this link to verify your email address for Tank:

${secureVerifyUrl}

Once verified you can close that tab — the Tank window you signed up in
unlocks on its own.

If you didn't sign up to Tank, ignore this email and nothing happens.

— Tank`;

  return sendMail({
    to: email,
    from: formatFrom(identity),
    replyTo: identity.mailbox,
    subject,
    html: buildTankVerifyEmailHtml(secureVerifyUrl),
    text,
    credentials: identity.credentials,
  });
}
