import { NextResponse } from "next/server";
import {
  getDirectorAttention,
  setDirectorAttention,
  releaseDirectorAttention,
} from "@/zones/tank/server/directorAttentionDb";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const lock = await getDirectorAttention();
  return NextResponse.json({ lock });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Verify moderator / admin permissions
    const { data: profile } = await supabase
      .from("tank_profiles")
      .select("role, username")
      .eq("user_id", user?.id ?? "")
      .maybeSingle();

    const role = profile?.role;
    if (role !== "admin" && role !== "moderator") {
      return NextResponse.json(
        { error: "Unauthorized: Moderator or Admin role required." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { targetType, targetId, targetLabel, durationMinutes, multiCameraMode } = body;

    const result = await setDirectorAttention({
      targetType: targetType ?? "room",
      targetId: targetId ?? "living-room",
      targetLabel: targetLabel ?? "Living Room",
      durationMinutes: durationMinutes ?? 30,
      operatorName: profile?.username ?? "Moderator",
      multiCameraMode: multiCameraMode ?? "audio_peak",
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, lock: result.lock });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update director attention" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: profile } = await supabase
      .from("tank_profiles")
      .select("role, username")
      .eq("user_id", user?.id ?? "")
      .maybeSingle();

    const role = profile?.role;
    if (role !== "admin" && role !== "moderator") {
      return NextResponse.json(
        { error: "Unauthorized: Moderator or Admin role required." },
        { status: 403 }
      );
    }

    const result = await releaseDirectorAttention(profile?.username ?? "Moderator");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to release director attention" },
      { status: 500 }
    );
  }
}
