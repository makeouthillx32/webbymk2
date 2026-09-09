// src/app/api/mail/threads/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const mailbox = url.searchParams.get("mailbox") || "support@unenter.live";
    const folder = url.searchParams.get("folder") || "inbox";
    const query = url.searchParams.get("q") || "";

    const supabase = createAdminClient();

    let dbQuery = supabase
      .from("mail_threads")
      .select("*")
      .eq("mailbox", mailbox)
      .order("last_message_at", { ascending: false });

    if (folder !== "all") {
      dbQuery = dbQuery.eq("folder", folder);
    }

    if (query) {
      dbQuery = dbQuery.or(`subject.ilike.%${query}%,snippet.ilike.%${query}%`);
    }

    const { data: threads, error } = await dbQuery;

    if (error) {
      console.error("[api/mail/threads] Error fetching threads:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If there are no threads yet for this mailbox, seed initial welcome threads
    if ((!threads || threads.length === 0) && !query && folder === "inbox") {
      const initialThread = {
        mailbox,
        subject: `Welcome to ${mailbox}`,
        snippet: "This unified inbox is connected to Poste.io and Brevo. You can now read and reply directly.",
        folder: "inbox",
        is_read: false,
        labels: ["work"],
        participant_names: ["Unenter Postmaster"],
        participant_emails: ["postmaster@unenter.live"],
        last_message_at: new Date().toISOString(),
      };

      const { data: createdThread } = await supabase
        .from("mail_threads")
        .insert(initialThread)
        .select()
        .single();

      if (createdThread) {
        await supabase.from("mail_messages").insert({
          thread_id: createdThread.id,
          from_name: "Unenter Postmaster",
          from_email: "postmaster@unenter.live",
          to_emails: [mailbox],
          subject: createdThread.subject,
          body_text: `Welcome to the unified mailbox for ${mailbox}.\n\nYour inbound mail on Poste.io (mail.unenter.live) and outbound delivery through Brevo (smtp-relay.brevo.com) are connected directly to this dashboard.\n\nAdmins and members can view threads, manage folders, and send replies without logging into separate webmail portals.`,
          is_outgoing: false,
          read: false,
        });

        return NextResponse.json({ threads: [createdThread] });
      }
    }

    return NextResponse.json({ threads: threads || [] });
  } catch (err: any) {
    console.error("[api/mail/threads] Uncaught error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
