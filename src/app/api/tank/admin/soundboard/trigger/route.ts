import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

// Site-wide channel — a soundboard clip is a whole-audience sound effect,
// not scoped to a chat room, so every connected viewer on the public Tank
// page hears it regardless of which room/chat scope they're in. Not
// exported: Next.js route files only allow recognized handler/config
// exports (see useTankSoundboardPlayer.ts's matching local constant).
const TANK_SOUNDBOARD_CHANNEL = "tank:soundboard";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  const { clipUrl, clipName } = (body ?? {}) as Record<string, unknown>;
  if (typeof clipUrl !== "string" || !clipUrl.trim()) {
    return NextResponse.json({ error: "clipUrl is required." }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const channel = adminSupabase.channel(TANK_SOUNDBOARD_CHANNEL);
  await channel.send({
    type: "broadcast",
    event: "play",
    payload: {
      clipUrl: clipUrl.trim(),
      clipName: typeof clipName === "string" ? clipName : "Clip",
      triggeredAt: new Date().toISOString(),
    },
  });

  return NextResponse.json({ ok: true });
}
