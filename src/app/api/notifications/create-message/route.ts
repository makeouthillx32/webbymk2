// app/api/notifications/create-message/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

interface CreateMessageNotificationRequest {
  channel_id: string;
  content: string;
}

function short(text: string, max = 50) {
  const t = (text ?? "").trim();
  return t.length > max ? t.slice(0, max) + "..." : t;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const body = (await req.json()) as Partial<CreateMessageNotificationRequest>;
    const channel_id = body.channel_id?.trim();
    const content = body.content ?? "";

    console.log("🔥 NOTIFICATION API CALLED:", {
      channel_id,
      content: String(content).slice(0, 20) + "...",
    });

    if (!channel_id || !content?.trim()) {
      return NextResponse.json(
        { error: "Missing required fields: channel_id, content" },
        { status: 400 }
      );
    }

    // 1) Who’s calling? (sender is the authenticated user)
    const {
      data: { user: me },
      error: meError,
    } = await supabase.auth.getUser();

    if (meError || !me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sender_id = me.id;

    // 2) Get sender display name (prefer profiles_with_auth)
    let senderName: string | null = null;

    const viewRes = await supabase
      .from("profiles_with_auth")
      .select("display_name, full_name, username, email")
      .eq("id", sender_id)
      .maybeSingle();

    if (!viewRes.error && viewRes.data) {
      senderName =
        viewRes.data.display_name ??
        viewRes.data.full_name ??
        viewRes.data.username ??
        viewRes.data.email ??
        null;
    } else {
      const profRes = await supabase
        .from("profiles")
        .select("display_name, full_name, username")
        .or(`id.eq.${sender_id},user_id.eq.${sender_id}`)
        .maybeSingle();

      if (!profRes.error && profRes.data) {
        senderName =
          (profRes.data as any).display_name ??
          (profRes.data as any).full_name ??
          (profRes.data as any).username ??
          null;
      }
    }

    if (!senderName) senderName = me.email ?? "Someone";

    console.log("🔥 SENDER NAME:", senderName);

    // 3) Channel participants except sender
    const { data: participants, error: participantsError } = await supabase
      .from("channel_participants")
      .select("user_id")
      .eq("channel_id", channel_id)
      .neq("user_id", sender_id);

    if (participantsError) {
      console.error("🔥 FAILED TO GET PARTICIPANTS:", participantsError.message);
      return NextResponse.json(
        { error: "Failed to fetch participants" },
        { status: 500 }
      );
    }

    if (!participants || participants.length === 0) {
      console.log("🔥 NO PARTICIPANTS FOUND");
      return NextResponse.json(
        { message: "No participants found to notify" },
        { status: 200 }
      );
    }

    console.log("🔥 FOUND PARTICIPANTS:", participants.length);

    // 4) Upsert-like behavior (update if recent, else create)
    const results: Array<{
      user_id: string;
      status: "created" | "updated" | "error";
      error?: string;
    }> = [];

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    for (const participant of participants) {
      const receiver_id = participant.user_id;

      try {
        // Check recent existing notification
        const { data: existing, error: checkError } = await supabase
          .from("notifications")
          .select("id")
          .eq("receiver_id", receiver_id)
          .eq("sender_id", sender_id)
          .like("title", "%sent you a message%")
          .gte("created_at", fiveMinutesAgo)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (checkError) {
          console.error("🔥 ERROR CHECKING EXISTING:", checkError.message);
          results.push({
            user_id: receiver_id,
            status: "error",
            error: checkError.message,
          });
          continue;
        }

        if (existing?.id) {
          console.log("🔥 UPDATING EXISTING NOTIFICATION:", existing.id);

          const { error: updateError } = await supabase
            .from("notifications")
            .update({
              subtitle: short(content),
              created_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

          if (updateError) {
            console.error("🔥 UPDATE FAILED:", updateError.message);
            results.push({
              user_id: receiver_id,
              status: "error",
              error: updateError.message,
            });
          } else {
            results.push({ user_id: receiver_id, status: "updated" });
          }
        } else {
          console.log("🔥 CREATING NEW NOTIFICATION");

          const { error: insertError } = await supabase
            .from("notifications")
            .insert({
              sender_id,
              receiver_id,
              title: `${senderName} sent you a message`,
              subtitle: short(content),
              image_url:
                "https://chsmesvozsjcgrwuimld.supabase.co/storage/v1/object/public/avatars/notification.png",
              action_url: "/dashboard/me/messages",
            });

          if (insertError) {
            console.error("🔥 INSERT FAILED:", insertError.message);
            results.push({
              user_id: receiver_id,
              status: "error",
              error: insertError.message,
            });
          } else {
            results.push({ user_id: receiver_id, status: "created" });
          }
        }
      } catch (e) {
        console.error("🔥 PARTICIPANT ERROR:", receiver_id, e);
        results.push({
          user_id: receiver_id,
          status: "error",
          error: String(e),
        });
      }
    }

    console.log("🔥 NOTIFICATION API COMPLETE:", results);

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("🔥 NOTIFICATION API ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
