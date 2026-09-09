import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getRecentChatMessages, sendChatMessage } from "./actions";
import type { ChatMessageType, ChatSearchResult } from "../contracts";
import { normalizeChatSearchQuery } from "./chatSearch";

const PUBLIC_ROOM_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const CLICK_ROOM_PATTERN = /^click:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DM_ROOM_PATTERN = /^dm:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REACTIONS = new Set(["love", "laugh", "wow", "fire", "skull"]);
const SEARCH_RESULT_LIMIT = 30;

async function searchChatMessages(
  roomId: string,
  rawQuery: string,
): Promise<{ results: ChatSearchResult[]; error?: string }> {
  const query = normalizeChatSearchQuery(rawQuery);
  if (query.length < 2) {
    return { results: [], error: "Search requires at least 2 characters." };
  }

  const supabase = await createClient();
  const select = "id, user_name, body, created_at, message_type" as const;
  const baseQuery = () =>
    supabase
      .from("tank_chat_messages")
      .select(select)
      .eq("room_id", roomId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(SEARCH_RESULT_LIMIT);

  const [bodyMatches, userMatches] = await Promise.all([
    baseQuery().ilike("body", `%${query}%`),
    baseQuery().ilike("user_name", `%${query}%`),
  ]);
  const error = bodyMatches.error || userMatches.error;
  if (error) return { results: [], error: "Chat search is temporarily unavailable." };

  const deduplicated = new Map<string, ChatSearchResult>();
  for (const row of [...(bodyMatches.data ?? []), ...(userMatches.data ?? [])]) {
    deduplicated.set(row.id, {
      id: row.id,
      user: row.user_name || "Member",
      body: row.body,
      createdAt: row.created_at,
      messageType:
        row.message_type && row.message_type !== "chat"
          ? (row.message_type as ChatMessageType)
          : undefined,
    });
  }

  return {
    results: [...deduplicated.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, SEARCH_RESULT_LIMIT),
  };
}

function isValidChatRoom(roomId: string) {
  return (
    roomId !== "director" &&
    (PUBLIC_ROOM_PATTERN.test(roomId) || CLICK_ROOM_PATTERN.test(roomId) || DM_ROOM_PATTERN.test(roomId))
  );
}

async function requireClickMembership(roomId: string) {
  if (!roomId.startsWith("click:")) return { allowed: true as const };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false as const, status: 401, error: "Sign in required for Click chat." };
  const { data } = await supabase
    .from("tank_click_members")
    .select("click_id")
    .eq("click_id", roomId.slice(6))
    .eq("user_id", user.id)
    .maybeSingle();
  return data
    ? { allowed: true as const }
    : { allowed: false as const, status: 403, error: "Click membership is required." };
}

// Tank Messenger DMs reuse tank_chat_messages the same way Click chat does —
// RLS on the table is the real gate, this is just an earlier, cheaper 401/403
// than letting an unauthenticated request hit the RPC and read back nothing.
async function requireDmMembership(roomId: string) {
  if (!roomId.startsWith("dm:")) return { allowed: true as const };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false as const, status: 401, error: "Sign in required for Tank Messenger." };
  const { data } = await supabase
    .from("tank_dm_conversations")
    .select("id")
    .eq("id", roomId.slice(3))
    .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
    .maybeSingle();
  return data
    ? { allowed: true as const }
    : { allowed: false as const, status: 403, error: "You are not part of this conversation." };
}

export async function handleChatMessagesGet(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("roomId") || "global";
  const search = request.nextUrl.searchParams.get("search");
  if (!isValidChatRoom(roomId)) {
    return NextResponse.json({ success: false, error: "Invalid room." }, { status: 400 });
  }
  const access = await requireClickMembership(roomId);
  if (!access.allowed) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status });
  }
  const dmAccess = await requireDmMembership(roomId);
  if (!dmAccess.allowed) {
    return NextResponse.json({ success: false, error: dmAccess.error }, { status: dmAccess.status });
  }


  if (search !== null) {
    const result = await searchChatMessages(roomId, search);
    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error, results: result.results },
        { status: normalizeChatSearchQuery(search).length < 2 ? 400 : 503 },
      );
    }
    return NextResponse.json({ success: true, results: result.results });
  }
  return NextResponse.json({ success: true, messages: await getRecentChatMessages(roomId) });
}

export async function handleChatMessagesPost(request: NextRequest) {
  let input: { roomId?: string; body?: string; clientNonce?: string; replyToMessageId?: string };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }
  if (!input.roomId || !isValidChatRoom(input.roomId) || typeof input.body !== "string") {
    return NextResponse.json({ success: false, error: "Invalid message." }, { status: 400 });
  }
  const access = await requireClickMembership(input.roomId);
  if (!access.allowed) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status });
  }
  const dmAccess = await requireDmMembership(input.roomId);
  if (!dmAccess.allowed) {
    return NextResponse.json({ success: false, error: dmAccess.error }, { status: dmAccess.status });
  }
  const result = await sendChatMessage(
    input.roomId,
    input.body,
    input.clientNonce,
    input.replyToMessageId,
  );
  const status = result.success ? 200 : result.error?.includes("signed in") ? 401 : 400;
  return NextResponse.json(result, { status });
}

export async function handleChatReactionPost(request: NextRequest) {
  let input: { messageId?: string; reaction?: string };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }
  if (!input.messageId || !input.reaction || !REACTIONS.has(input.reaction)) {
    return NextResponse.json({ success: false, error: "Invalid reaction." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });

  const { data: message } = await supabase
    .from("tank_chat_messages")
    .select("id, room_id")
    .eq("id", input.messageId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!message) return NextResponse.json({ success: false, error: "Message unavailable." }, { status: 404 });

  const { data: existing } = await supabase
    .from("tank_chat_reactions")
    .select("message_id")
    .eq("message_id", input.messageId)
    .eq("user_id", user.id)
    .eq("reaction", input.reaction)
    .maybeSingle();

  const result = existing
    ? await supabase.from("tank_chat_reactions").delete()
        .eq("message_id", input.messageId).eq("user_id", user.id).eq("reaction", input.reaction)
    : await supabase.from("tank_chat_reactions").insert({
        message_id: input.messageId,
        user_id: user.id,
        reaction: input.reaction,
      });
  if (result.error) {
    return NextResponse.json({ success: false, error: result.error.message }, { status: 400 });
  }

  if (!message.room_id.startsWith("click:")) {
    const admin = createAdminClient();
    const channel = admin.channel(`room:${message.room_id}:chat`);
    try {
      await channel.httpSend("reaction_changed", {
        messageId: input.messageId,
        reaction: input.reaction,
        userId: user.id,
        active: !existing,
      });
    } finally {
      await admin.removeChannel(channel);
    }
  }
  return NextResponse.json({ success: true, active: !existing });
}
