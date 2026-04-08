import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;

    if (userErr || !user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: profileData, error: profileErr } = await supabase
      .from("profiles")
      .select("id, role, avatar_url, display_name, created_at")
      .eq("id", user.id)
      .single();

    if (profileErr || !profileData?.id) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      id: profileData.id,
      role: profileData.role ?? null,
      avatar_url: profileData.avatar_url ?? null,
      display_name: profileData.display_name ?? null,

      // auth/user fields (for ProfileCard)
      email: user.email ?? null,
      email_confirmed_at: user.email_confirmed_at ?? null,
      created_at: profileData.created_at ?? user.created_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      app_metadata: user.app_metadata ?? {},
    });
  } catch {
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}