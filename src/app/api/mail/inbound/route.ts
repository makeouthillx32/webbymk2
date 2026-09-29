// src/app/api/mail/inbound/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const supabase = createAdminClient();

    // Brevo Inbound Parse delivers an array in payload.items, or single email object
    const items = Array.isArray(payload.items) ? payload.items : [payload];

    for (const item of items) {
      const fromEmail = item.From?.Address || item.from || item.sender || "unknown@sender.com";
      const fromName = item.From?.Name || item.from_name || fromEmail.split("@")[0];
      const toEmails: string[] = Array.isArray(item.To)
        ? item.To.map((t: any) => t.Address || t)
        : [item.to || item.recipient || "support@unenter.live"];

      const subject = item.Subject || item.subject || "(No Subject)";
      const bodyText = item.ExtractedMarkdownMessage || item.text || item.body || "";
      const bodyHtml = item.RawHtmlBody || item.html || null;
      const messageId = item.MessageId || item.message_id || null;
      const inReplyTo = item.InReplyTo || item.in_reply_to || null;

      // Primary mailbox is the first recipient
      const primaryMailbox = toEmails[0] || "support@unenter.live";

      // Try matching an existing thread by inReplyTo or matching subject
      let threadId: string | null = null;

      if (inReplyTo) {
        const { data: matchedMsg } = await supabase
          .from("mail_messages")
          .select("thread_id")
          .eq("message_id", inReplyTo)
          .maybeSingle();

        if (matchedMsg) {
          threadId = matchedMsg.thread_id;
        }
      }

      if (!threadId) {
        const cleanSubject = subject.replace(/^(re|fwd):\s*/i, "").trim();
        const { data: matchedThread } = await supabase
          .from("mail_threads")
          .select("id")
          .eq("mailbox", primaryMailbox)
          .ilike("subject", `%${cleanSubject}%`)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (matchedThread) {
          threadId = matchedThread.id;
        }
      }

      // If no matching thread, create a new one
      if (!threadId) {
        const { data: newThread, error: tErr } = await supabase
          .from("mail_threads")
          .insert({
            mailbox: primaryMailbox,
            subject,
            snippet: (bodyText || "").substring(0, 120),
            folder: "inbox",
            is_read: false,
            labels: ["work"],
            participant_names: [fromName],
            participant_emails: [fromEmail],
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (tErr || !newThread) {
          console.error("[api/mail/inbound] Thread create error:", tErr);
          continue;
        }
        threadId = newThread.id;
      } else {
        // Update existing thread
        await supabase
          .from("mail_threads")
          .update({
            snippet: (bodyText || "").substring(0, 120),
            folder: "inbox",
            is_read: false,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", threadId);
      }

      // Insert message
      await supabase.from("mail_messages").insert({
        thread_id: threadId,
        message_id: messageId,
        in_reply_to: inReplyTo,
        from_name: fromName,
        from_email: fromEmail,
        to_emails: toEmails,
        subject,
        body_text: bodyText,
        body_html: bodyHtml,
        is_outgoing: false,
        read: false,
        headers: item.Headers || {},
        attachments: item.Attachments || [],
      });
    }

    return NextResponse.json({ success: true, processed: items.length });
  } catch (err: any) {
    console.error("[api/mail/inbound] Error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
