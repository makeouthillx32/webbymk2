import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { banUser, deleteChatMessageDb, getAutomodConfig, getBannedUsers, purgeChatRoomDb, unbanUser, updateAutomodConfig } from "./chatModerationDb";

async function getStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("display_name, role").eq("id", user.id).maybeSingle();
  if (!profile || !["admin", "moderator"].includes(String(profile.role))) return null;
  return { user, profile };
}

export async function handleChatModerationGet() {
  const staff = await getStaff();
  return NextResponse.json({
    success: true,
    automodConfig: await getAutomodConfig(),
    bannedUsers: staff ? await getBannedUsers() : [],
    isStaff: Boolean(staff),
  });
}

export async function handleChatModerationPost(req: Request) {
  const staff = await getStaff();
  if (!staff) return NextResponse.json({ success: false, error: "Staff only." }, { status: 403 });
  let body: Record<string, any>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }
  const operator = staff.profile.display_name || "Staff";
  const roomId = typeof body.roomId === "string" ? body.roomId : "global";
  if (body.action === "delete" && typeof body.messageId === "string") {
    return NextResponse.json(await deleteChatMessageDb(body.messageId, roomId, operator));
  }
  if (body.action === "purge") {
    return NextResponse.json({ success: false, error: "Chat purge is disabled for all users and roles." }, { status: 403 });
  }
  if (body.action === "ban" && typeof body.userId === "string") {
    const parsed = body.durationMinutes === "permanent" ? "permanent" : Number(body.durationMinutes);
    const durationMinutes = parsed === "permanent" || Number.isFinite(parsed) ? parsed : "permanent";
    return NextResponse.json(await banUser({
      userId: body.userId,
      userName: String(body.userName || "Member").slice(0, 80),
      reason: String(body.reason || "Violated chat guidelines").slice(0, 300),
      durationMinutes,
      bannedBy: operator,
    }));
  }
  if (body.action === "unban" && typeof body.userId === "string") return NextResponse.json(await unbanUser(body.userId));
  if (body.action === "update_config" && body.config && typeof body.config === "object") {
    return NextResponse.json(await updateAutomodConfig(body.config));
  }
  return NextResponse.json({ success: false, error: "Invalid moderation action." }, { status: 400 });
}
