// lib/mail/identities.ts
// Central registry of the app's mail "branches" — every outbound email picks
// one of these instead of ad-hoc env var lookups scattered around the code.
//
//   support  — shop order confirmations, general customer contact
//   labs     — research-chemical order confirmations (adds the research
//              disclaimer), branded "Unenter Labs"
//   admin    — internal alerts (cash-out requests, failures) — humans only,
//              never customer-facing
//   auth     — Supabase/GoTrue's own signup/reset/invite emails. This one is
//              consumed by docker-compose.yml directly as SMTP_USER/SMTP_PASS
//              (GoTrue reads those two names specifically — can't rename
//              them), so its "credentials" here just describe the same
//              mailbox for reference; nothing in this app sends through it.
//
// Two addresses per branch (2026-08-09 — Brevo relay migration):
//   `address` — what goes in the From header. Must be on a domain Brevo has
//     domain-authenticated, which today is only the root `unenter.live`, NOT
//     the `mail.unenter.live` subdomain (Brevo validates the exact sending
//     domain, doesn't inherit from the parent — confirmed via a live send
//     that Brevo rejected with "sender ... is not valid"). Adding
//     mail.unenter.live as its own authenticated domain in Brevo would need
//     a brevo-code TXT at the bare "mail" name, which collides with the
//     existing CNAME there (mail -> unenter.asuscomm.com) — same
//     CNAME-exclusivity wall that blocked SPF earlier. Root-domain From it is.
//   `mailbox` — the real, receiving mailbox on poste.io (mail.unenter.live).
//     unenter.live has no MX of its own, so `address` can't receive replies.
//     Callers should pass `replyTo: identity.mailbox` so customer replies
//     still land somewhere real instead of bouncing.
//
// Create each poste.io mailbox from Dashboard → Admin → Mail before relying
// on one — getMailIdentity() only reads env vars, it doesn't check the
// mailbox exists.
import type { SmtpCredentials } from "./client";

export type MailBranch = "support" | "labs" | "admin" | "auth" | "tank";

export interface MailIdentity {
  branch: MailBranch;
  /** From header address — must live on a Brevo-authenticated domain. */
  address: string;
  /** Real poste.io mailbox that can receive replies — use as replyTo. */
  mailbox: string;
  displayName: string;
  credentials?: SmtpCredentials;
}

function creds(user?: string, pass?: string): SmtpCredentials | undefined {
  return user && pass ? { user, pass } : undefined;
}

export function getMailIdentity(branch: MailBranch): MailIdentity {
  switch (branch) {
    case "support":
      return {
        branch,
        address: process.env.MAIL_SEND_FROM_SUPPORT || "support@unenter.live",
        mailbox: process.env.MAIL_FROM_SUPPORT || "support@mail.unenter.live",
        displayName: "unenter.live",
        credentials: creds(process.env.MAIL_SMTP_USER_SUPPORT, process.env.MAIL_SMTP_PASS_SUPPORT),
      };
    case "labs":
      return {
        branch,
        address: process.env.MAIL_SEND_FROM_LABS || "labs@unenter.live",
        mailbox: process.env.MAIL_FROM_LABS || "labs@mail.unenter.live",
        displayName: "Unenter Labs",
        credentials: creds(process.env.MAIL_SMTP_USER_LABS, process.env.MAIL_SMTP_PASS_LABS),
      };
    case "admin":
      return {
        branch,
        address: process.env.MAIL_SEND_FROM_ADMIN || "admin@unenter.live",
        mailbox: process.env.MAIL_FROM_ADMIN || "admin@mail.unenter.live",
        displayName: "unenter.live Admin",
        credentials: creds(process.env.MAIL_SMTP_USER_ADMIN, process.env.MAIL_SMTP_PASS_ADMIN),
      };
    case "tank":
      return {
        branch,
        address: process.env.MAIL_SEND_FROM_TANK || "tank@unenter.live",
        mailbox: process.env.MAIL_FROM_TANK || "tank@mail.unenter.live",
        displayName: "Tank",
        credentials: creds(process.env.MAIL_SMTP_USER_TANK, process.env.MAIL_SMTP_PASS_TANK),
      };
    case "auth":
      // GoTrue sends these itself via docker-compose's SMTP_USER/SMTP_PASS —
      // this branch exists here only so the rest of the app can find out
      // what that address is (e.g. to show it in the dashboard). SMTP_USER
      // is now Brevo's opaque relay login, not a real address, so read
      // SMTP_ADMIN_EMAIL (what docker-compose actually puts in GoTrue's From)
      // instead.
      return {
        branch,
        address: process.env.SMTP_ADMIN_EMAIL || "auth@unenter.live",
        mailbox: process.env.SMTP_ADMIN_EMAIL || "auth@unenter.live",
        displayName: "unenter.live",
        credentials: creds(process.env.SMTP_USER, process.env.SMTP_PASS),
      };
  }
}

/** "Display Name <address>" — the exact string nodemailer wants for `from`. */
export function formatFrom(identity: MailIdentity): string {
  return `${identity.displayName} <${identity.address}>`;
}
