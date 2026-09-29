// lib/mail/client.ts
// Thin SMTP wrapper around nodemailer. Same relay (poste.io on L0V3 /
// mail.unenter.live) GoTrue uses for auth emails, but each app "from"
// identity (support@, labs@) authenticates as its own mailbox — most mail
// servers reject a From that doesn't match the authenticated user, so one
// shared login isn't enough once you're sending from more than one address.
import nodemailer, { type Transporter } from "nodemailer";
import { createAdminClient } from "@/utils/supabase/admin";

export type SmtpCredentials = { user: string; pass: string };

// Guardrail (2026-08-08): a failed send used to only console.error, which is
// how the poste.io blacklist + self-signed-cert issues both went unnoticed —
// nobody was tailing logs. Every failure now also lands in `mail_failures` so
// it's queryable and surfaced in the admin dashboard. Best-effort: a DB hiccup
// here must never fail (or even slow down) the caller's actual send attempt.
async function logMailFailure(input: {
  to: string;
  subject: string;
  reason: string;
  order_id?: string | null;
  context?: Record<string, unknown>;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("mail_failures").insert({
      to_email: input.to,
      subject: input.subject,
      reason: input.reason,
      order_id: input.order_id ?? null,
      context: input.context ?? null,
    });
  } catch (logErr) {
    // Never let failure-logging itself break anything — just note it in logs.
    console.error("[mail] Failed to record mail_failures row:", logErr);
  }
}

// Records a successful transactional send into the same mail_threads/
// mail_messages tables the dashboard's unified inbox reads — without this,
// every Tank verify/welcome email, order confirmation, admin alert, etc. went
// out via Brevo successfully but never showed up in the dashboard at all
// (confirmed 2026-09-22: months of real sends, zero rows). Best-effort, same
// as logMailFailure — a DB hiccup here must never fail the send itself.
async function logMailSent(input: {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}) {
  try {
    const admin = createAdminClient();
    // replyTo is always identity.mailbox (e.g. "tank@unenter.live") — the
    // real receiving mailbox this send belongs to. Falls back to the From
    // address if a caller ever omits replyTo.
    const mailbox = input.replyTo || input.from.match(/<(.+)>/)?.[1] || input.from;
    const fromNameMatch = input.from.match(/^(.*?)\s*<.+>$/);
    const fromName = fromNameMatch ? fromNameMatch[1] : input.from;
    const fromEmail = input.from.match(/<(.+)>/)?.[1] || input.from;

    const { data: thread, error: threadErr } = await admin
      .from("mail_threads")
      .insert({
        mailbox,
        subject: input.subject,
        snippet: input.text.slice(0, 120),
        folder: "sent",
        is_read: true,
        labels: ["work"],
        participant_names: [input.to],
        participant_emails: [input.to],
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (threadErr || !thread) {
      console.error("[mail] logMailSent thread insert failed:", threadErr);
      return;
    }

    await admin.from("mail_messages").insert({
      thread_id: thread.id,
      from_name: fromName,
      from_email: fromEmail,
      to_emails: [input.to],
      reply_to: input.replyTo,
      subject: input.subject,
      body_text: input.text,
      body_html: input.html,
      is_outgoing: true,
      read: true,
    });
  } catch (logErr) {
    console.error("[mail] Failed to record sent mail:", logErr);
  }
}

const transportCache = new Map<string, Transporter>();

function getTransport(creds?: SmtpCredentials): Transporter | null {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = creds?.user || process.env.SMTP_USER;
  const pass = creds?.pass || process.env.SMTP_PASS;

  if (!host) return null; // Not configured yet — callers should no-op, not throw.

  const key = `${host}:${port}:${user ?? ""}`;
  const existing = transportCache.get(key);
  if (existing) return existing;

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 587/25 use STARTTLS, 465 is implicit TLS
    auth: user && pass ? { user, pass } : undefined,
    // mail.unenter.live (self-hosted poste.io) serves its own self-signed cert,
    // not a Let's Encrypt one (confirmed via openssl s_client, 2026-08-08:
    // verify code 18 — self signed certificate). Node's default TLS validation
    // rejects it, which silently killed every transactional email. This is a
    // deliberate short-term tradeoff: still encrypted in transit, just not
    // certificate-authenticated, acceptable for now since this relay never
    // leaves our own infra. Revert to default (remove this block) once poste.io
    // is issuing a real cert for mail.unenter.live. See
    // vault/Core/access-denied-reload-loop-2026-08-08.md for the related
    // incident this was uncovered during.
    tls: { rejectUnauthorized: false },
  });
  transportCache.set(key, transport);
  return transport;
}

export type SendMailInput = {
  to: string;
  from: string; // "Display Name <address@unenter.live>"
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Authenticate as this mailbox instead of the default SMTP_USER/PASS. */
  credentials?: SmtpCredentials;
  /**
   * Set false only by callers that already do their own mail_threads/
   * mail_messages bookkeeping with proper thread reuse — today just
   * api/mail/send/route.ts, which appends replies to an existing thread
   * instead of always starting a new one. Every other caller (Tank verify/
   * welcome, order confirmations, admin alerts, ...) has no logging of its
   * own, so this defaults to true.
   */
  logToInbox?: boolean;
  /** Optional — lets a failure be traced back to the order that triggered it. */
  order_id?: string;
};

/**
 * Sends an email. Returns { sent: false, reason } instead of throwing when
 * SMTP isn't configured yet, so callers (webhooks, etc.) can log and move on
 * without failing the operation that triggered the email. Every failure is
 * also recorded to `mail_failures` — see logMailFailure() above.
 */
export async function sendMail(input: SendMailInput): Promise<{ sent: boolean; reason?: string }> {
  const transport = getTransport(input.credentials);

  if (!transport) {
    const reason = "SMTP not configured";
    console.warn(`[mail] SMTP_HOST not set — skipping email to ${input.to} ("${input.subject}")`);
    await logMailFailure({ to: input.to, subject: input.subject, reason, order_id: input.order_id });
    return { sent: false, reason };
  }

  try {
    await transport.sendMail({
      to: input.to,
      from: input.from,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
    if (input.logToInbox !== false) await logMailSent(input);
    return { sent: true };
  } catch (err: any) {
    const reason = err?.message ?? "Unknown send error";
    console.error(`[mail] Failed to send to ${input.to}:`, reason);
    await logMailFailure({
      to: input.to,
      subject: input.subject,
      reason,
      order_id: input.order_id,
      context: { from: input.from },
    });
    return { sent: false, reason };
  }
}
