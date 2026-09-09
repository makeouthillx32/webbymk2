// src/app/api/mail/threads/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: thread, error: threadErr } = await supabase
      .from("mail_threads")
      .select("*")
      .eq("id", id)
      .single();

    if (threadErr || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const { data: messages, error: msgErr } = await supabase
      .from("mail_messages")
      .select("*")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });

    if (msgErr) {
      return NextResponse.json({ error: msgErr.message }, { status: 500 });
    }

    return NextResponse.json({ thread, messages: messages || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const supabase = createAdminClient();

    const allowedUpdates: Record<string, any> = {};
    if (typeof body.is_read === "boolean") allowedUpdates.is_read = body.is_read;
    if (body.folder && ["inbox", "drafts", "sent", "junk", "trash", "archive"].includes(body.folder)) {
      allowedUpdates.folder = body.folder;
    }
    if (Array.isArray(body.labels)) allowedUpdates.labels = body.labels;

    allowedUpdates.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from("mail_threads")
      .update(allowedUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ thread: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
