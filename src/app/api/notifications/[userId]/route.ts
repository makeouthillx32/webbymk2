import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await createClient();
  const { userId } = await params;

  // 1) Who’s calling?
  const {
    data: { user: me },
    error: meError,
  } = await supabase.auth.getUser();

  if (meError || !me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) Get caller role (support id OR user_id schemas)
  const { data: myProfile, error: myProfileErr } = await supabase
    .from("profiles")
    .select("role")
    .or(`id.eq.${me.id},user_id.eq.${me.id}`)
    .maybeSingle();

  if (myProfileErr) {
    return NextResponse.json({ error: "Profile lookup failed" }, { status: 500 });
  }

  const myRole = myProfile?.role ?? "guest";

  // Only allow "me" or an admin to fetch another user’s feed
  if (userId !== me.id && myRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3) Target role (admin/member/guest)
  const { data: targetProfile, error: tpErr } = await supabase
    .from("profiles")
    .select("role")
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .maybeSingle();

  if (tpErr || !targetProfile?.role) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const targetRole = targetProfile.role as "admin" | "member" | "guest";

  // 4) Pull last 10 notifications:
  // - direct to receiver_id
  // - OR targeted to their role
  // - OR broadcast (target_role is null)
  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("id, title, subtitle, image_url, action_url, created_at")
    .or(
      [
        `receiver_id.eq.${userId}`,
        `target_role.eq.${targetRole}`,
        `target_role.is.null`,
      ].join(",")
    )
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notifications: notifications ?? [] });
}
