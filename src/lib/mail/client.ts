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
