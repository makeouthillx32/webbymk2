// app/api/notifications/route.ts
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

const API_DISABLED = process.env.NOTIFICATIONS_API_ENABLED === "false";

function normalizeRole(role: any): "admin" | "member" | "guest" {
  if (role === "admin" || role === "member" || role === "guest") return role;
  return "guest";
}

export async function GET() {
  if (API_DISABLED) {
    return NextResponse.json(
      { message: "Notifications temporarily disabled." },
      { status: 503 }
    );
  }

  const supabase = await createClient();

  // Auth user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get user's role (support id OR user_id)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .or(`id.eq.${user.id},user_id.eq.${user.id}`)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: "Profile lookup failed" }, { status: 500 });
    }

    const userRole = normalizeRole(profile?.role);

    // Notifications:
    // - receiver-specific
    // - role-targeted
    // - broadcast (target_role null)
    const { data: notifications, error } = await supabase
      .from("notifications")
      .select(
        `
        id,
        sender_id,
        receiver_id,
        type,
        title,
        subtitle,
        content,
        metadata,
        image_url,
        action_url,
        is_read,
        created_at,
        target_role
      `
      )
      .or(
        [
          `receiver_id.eq.${user.id}`,
          `target_role.eq.${userRole}`,
          `target_role.is.null`,
        ].join(",")
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform to keep backward compatibility with your UI
    const transformedNotifications = (notifications ?? []).map((n: any) => ({
      id: n.id,
      sender_id: n.sender_id ?? null,
      receiver_id: n.receiver_id ?? null,
      type: n.type ?? "general",
      title: n.title ?? "",
      // Support both "subtitle" and "content" styles
      subtitle: n.subtitle ?? n.content ?? "",
      content: n.content ?? n.subtitle ?? "",
      metadata: n.metadata ?? {},
      image_url: n.image_url ?? null,
      action_url: n.action_url ?? null,
      is_read: n.is_read ?? false,
      created_at: n.created_at,
      target_role: n.target_role ?? null,
    }));

    return NextResponse.json({
      notifications: transformedNotifications,
      user_id: user.id,
      user_role: userRole,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
