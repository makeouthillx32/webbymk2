// src/app/api/mail/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendMail } from "@/lib/mail/client";
import { getMailIdentity, formatFrom, MailBranch } from "@/lib/mail/identities";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      threadId,
      to,
      subject,
      text,
      mailbox = "support@unenter.live",
    } = body;

    if (!to || !text) {
      return NextResponse.json(
        { error: "Missing required fields: 'to' and 'text'" },
        { status: 400 }
      );
    }

    // Determine branch from mailbox
    let branch: MailBranch = "support";
    if (mailbox.includes("admin")) branch = "admin";
    else if (mailbox.includes("labs")) branch = "labs";
    else if (mailbox.includes("tank")) branch = "tank";

    const identity = getMailIdentity(branch);
    const from = formatFrom(identity);

    // Send email through Brevo relay via sendMail
    const sendResult = await sendMail({
      to,
      from,
      subject: subject || "No Subject",
      text,
      html: `<div style="font-family: sans-serif; white-space: pre-wrap;">${text}</div>`,
      replyTo: identity.mailbox,
      credentials: identity.credentials,
    });

    if (!sendResult.sent) {
      return NextResponse.json(
        { error: sendResult.reason || "Failed to deliver email" },
        { status: 502 }
      );
    }

    const supabase = createAdminClient();
    let effectiveThreadId = threadId;

    // If threadId is provided, append to existing thread. Otherwise create new thread.
    if (!effectiveThreadId) {
      const { data: newThread, error: threadErr } = await supabase
        .from("mail_threads")
        .insert({
          mailbox,
          subject: subject || "No Subject",
          snippet: text.substring(0, 120),
          folder: "sent",
          is_read: true,
          labels: ["work"],
          participant_names: [to],
          participant_emails: [to],
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (threadErr || !newThread) {
        return NextResponse.json({ error: threadErr?.message || "Failed to create thread" }, { status: 500 });
      }
      effectiveThreadId = newThread.id;
    } else {
      // Update thread last_message_at, snippet, and set is_read = true
      await supabase
        .from("mail_threads")
        .update({
          snippet: text.substring(0, 120),
          last_message_at: new Date().toISOString(),
          is_read: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", effectiveThreadId);
    }

    // Insert outgoing message
    const { data: message, error: msgErr } = await supabase
      .from("mail_messages")
      .insert({
        thread_id: effectiveThreadId,
        from_name: identity.displayName,
        from_email: identity.address,
        to_emails: [to],
        reply_to: identity.mailbox,
        subject: subject || "No Subject",
        body_text: text,
        body_html: `<div style="font-family: sans-serif; white-space: pre-wrap;">${text}</div>`,
        is_outgoing: true,
        read: true,
      })
      .select()
      .single();

    if (msgErr) {
      return NextResponse.json({ error: msgErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      threadId: effectiveThreadId,
      message,
    });
  } catch (err: any) {
    console.error("[api/mail/send] Error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
