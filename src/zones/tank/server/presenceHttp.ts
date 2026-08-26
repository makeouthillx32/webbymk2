import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  extractClientIp,
  getPresenceSnapshot,
  recordHeartbeat,
  HEARTBEAT_INTERVAL_SECONDS,
  PRESENCE_TTL_SECONDS,
} from "./viewerPresence";

// Handlers kept out of app/ — zones/tank/src/app replaces src/app in the Tank
// image, so a zone route re-exporting "@/app/..." would recurse into itself.

/**
 * POST /api/tank/presence/heartbeat
 *
 * Open by design: anyone looking at the feed counts, signed in or not. The
 * body carries only a device key and a self-reported connection hint — the IP
 * and user agent come from the request itself, so nothing identifying is
 * client-controlled.
 */
export async function handlePresenceHeartbeat(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // A bodiless ping is still a valid "I'm here" from a minimal client.
  }

  const viewerKey = typeof body?.viewerKey === "string" ? body.viewerKey.trim() : "";
  if (!viewerKey) {
    return NextResponse.json({ success: false, error: "viewerKey is required." }, { status: 400 });
  }

  // Signing in is optional. A session, if present, upgrades the viewer from an
  // anonymous name to their account without changing how they are counted.
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {}

  const result = await recordHeartbeat({
    viewerKey,
    roomSlug: typeof body?.roomSlug === "string" ? body.roomSlug : undefined,
    connectionType: body?.connectionType,
    userAgent: req.headers.get("user-agent"),
    ip: extractClientIp(req.headers),
    userId,
  });

  return NextResponse.json({
    success: true,
    ...result,
    intervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
    ttlSeconds: PRESENCE_TTL_SECONDS,
  });
}

/** GET /api/tank/presence — read-only count, for anything that isn't a viewer. */
export async function handlePresenceRead() {
  return NextResponse.json({ success: true, presence: await getPresenceSnapshot() });
}

/** Staff-only room roster, backed by verified server heartbeats. */
export async function handleHousePresenceRead(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });

  const admin = createAdminClient();
  const { data: actingProfile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!actingProfile || !["admin", "moderator"].includes(String(actingProfile.role))) {
    return NextResponse.json({ success: false, error: "Staff only." }, { status: 403 });
  }

  const url = new URL(req.url);
  const rooms = (url.searchParams.get("rooms") || "")
    .split(",").map((room) => room.trim()).filter(Boolean).slice(0, 30);
  let query = admin
    .from("tank_viewer_sessions")
    .select("viewer_key, user_id, anon_name, room_slug, connection_type, user_agent, last_seen_at")
    .eq("client_kind", "human")
    .gte("last_seen_at", new Date(Date.now() - PRESENCE_TTL_SECONDS * 1000).toISOString());
  if (rooms.length) query = query.in("room_slug", rooms);
  const { data: sessions, error } = await query;
  if (error) return NextResponse.json({ success: false, error: "Presence unavailable." }, { status: 500 });

  const userIds = Array.from(new Set((sessions ?? []).map((session) => session.user_id).filter(Boolean))) as string[];
  const [{ data: profiles }, { data: expRows }] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("id, display_name, avatar_url, role").in("id", userIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? admin.from("tank_user_experience").select("user_id, xp, level, tokens").in("user_id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const expMap = new Map((expRows ?? []).map((exp) => [exp.user_id, exp]));

  const viewers = (sessions ?? []).map((session) => {
    const profile = session.user_id ? profileMap.get(session.user_id) : null;
    const exp = session.user_id ? expMap.get(session.user_id) : null;
    const role = profile?.role || (session.user_id ? "member" : "viewer");
    const level = exp?.level ?? 1;
    const xp = exp?.xp ?? 0;
    const tokens = exp?.tokens ?? 0;

    let rank = "Newbie";
    if (role === "admin") rank = "Admin";
    else if (role === "moderator") rank = "Mod";
    else if (level >= 10) rank = "Legend";
    else if (level >= 5) rank = "Veteran";
    else if (level >= 3) rank = "VIP";
    else if (level >= 2) rank = "Regular";

    const isCellular =
      session.connection_type === "cellular" ||
      Boolean(session.user_agent && /Mobile|Android|iPhone|iPad/i.test(session.user_agent));

    return {
      roomKey: session.room_slug,
      userId: session.user_id,
      displayName: profile?.display_name || session.anon_name || "Viewer",
      avatarUrl: profile?.avatar_url || null,
      role,
      level,
      xp,
      tokens,
      rank,
      connectionType: session.connection_type || "unknown",
      isCellular,
      lastSeenAt: session.last_seen_at,
    };
  });
  return NextResponse.json({ success: true, viewers });
}
