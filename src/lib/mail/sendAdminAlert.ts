// lib/mail/sendAdminAlert.ts
// Real email to a human, via the "admin" mail branch — for things that need
// someone to actually go do something (a cash-out is waiting to be paid, a
// creator payout failed, etc). This is separate from lib/notifications.ts,
// which writes an in-app bell notification (`notifications` table) — that's
// silent if nobody has the dashboard open. Use this when it matters if the
// message is missed.
import { sendMail } from "./client";
import { getMailIdentity, formatFrom } from "./identities";

export type AdminAlertInput = {
  subject: string;
  /** Plain-text body — short and actionable. Wrapped in a minimal HTML shell. */
  message: string;
  actionUrl?: string;
  /** Defaults to MAIL_FROM_ADMIN itself (i.e. admin emails admin) unless overridden. */
  to?: string;
};

export async function sendAdminAlert(input: AdminAlertInput): Promise<{ sent: boolean; reason?: string }> {
  const admin = getMailIdentity("admin");
  const to = input.to || admin.address;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111;">
    <h2 style="margin-bottom:8px;">${input.subject}</h2>
    <p style="white-space:pre-wrap;">${input.message}</p>
    ${input.actionUrl ? `<p><a href="${input.actionUrl}" style="color:#2563eb;">${input.actionUrl}</a></p>` : ""}
  </div>`;

  const text = [input.message, input.actionUrl ?? ""].filter(Boolean).join("\n\n");

  return sendMail({
    to,
    from: formatFrom(admin),
    replyTo: admin.mailbox,
    subject: `[unenter.live] ${input.subject}`,
    html,
    text,
    credentials: admin.credentials,
  });
}
