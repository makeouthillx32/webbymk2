// src/app/api/contact/route.ts
// Public contact-form endpoint. Deliberately unauthenticated — this is the
// "how a stranger reaches us" surface, so there's no user to require a
// session from. Used by every zone's /contact page (see src/app/contact/).
//
// Was previously entirely missing — every zone's contact form was a fake
// stub (a setTimeout showing a random ticket ID, nothing ever sent) and
// several zones' footers pointed at Labs' form even though it looked
// Labs-branded to everyone. Fixed 2026-09-24 alongside the mail-inbound
// pipeline work: this route now actually delivers the message AND logs it
// into the dashboard's unified inbox as a real inbound thread, the same
// shape api/mail/inbound/route.ts uses for mail arriving from Brevo.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendMail } from "@/lib/mail/client";
import { getMailIdentity, formatFrom, type MailBranch } from "@/lib/mail/identities";

// Only branches a public visitor should ever be able to target — never lets
// the request body pick an arbitrary mailbox (e.g. "admin" or "auth").
const ALLOWED_BRANCHES: MailBranch[] = ["support", "labs", "shop", "tank"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const name = String(body.name || "").trim().slice(0, 200);
  const email = String(body.email || "").trim().slice(0, 320);
  const subject = String(body.subject || "").trim().slice(0, 200) || "Contact form inquiry";
  const message = String(body.message || "").trim().slice(0, 5000);
  const branchInput = String(body.branch || "support").trim() as MailBranch;
  const branch: MailBranch = ALLOWED_BRANCHES.includes(branchInput) ? branchInput : "support";

  if (!name || !email || !message) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const identity = getMailIdentity(branch);
  const notifySubject = `[Contact] ${subject}`;
  const bodyText = `From: ${name} <${email}>\n\n${message}`;
  const bodyHtml = `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p><p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>`;

  // logToInbox: false — sendMail's own logging always tags a send as
  // is_outgoing: true, which is backwards here: this is a real inbound
  // inquiry FROM the visitor, not an outgoing message from us. Logged below
  // instead, in the same shape real inbound mail uses.
  const result = await sendMail({
    to: identity.mailbox,
    from: formatFrom(identity),
    subject: notifySubject,
    text: bodyText,
    html: bodyHtml,
    replyTo: email,
    credentials: identity.credentials,
    logToInbox: false,
  });

  if (!result.sent) {
    return NextResponse.json({ error: result.reason || "Failed to send" }, { status: 502 });
  }

  try {
    const admin = createAdminClient();
    const { data: thread } = await admin
      .from("mail_threads")
      .insert({
        mailbox: identity.mailbox,
        subject: notifySubject,
        snippet: message.slice(0, 120),
        folder: "inbox",
        is_read: false,
        labels: ["work"],
        participant_names: [name],
        participant_emails: [email],
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (thread) {
      await admin.from("mail_messages").insert({
        thread_id: thread.id,
        from_name: name,
        from_email: email,
        to_emails: [identity.mailbox],
        subject: notifySubject,
        body_text: bodyText,
        body_html: bodyHtml,
        is_outgoing: false,
        read: false,
      });
    }
  } catch (err) {
    // The email itself already sent successfully — never fail the visitor's
    // request over a dashboard-logging hiccup.
    console.error("[api/contact] Failed to log inbound thread:", err);
  }

  return NextResponse.json({ success: true });
}
