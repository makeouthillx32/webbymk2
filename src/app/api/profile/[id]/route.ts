// app/api/profile/route.ts
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

type ProfileRow = {
  id: string;
  role: string | null;
  avatar_url: string | null;
  initials: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  region: string | null;
};

export async function GET() {
  try {
    // IMPORTANT: this must use the request cookies/session
    // so do NOT pass "service" here
    const supabase = await createClient();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.user.id;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id,role,avatar_url,initials,display_name,first_name,last_name,region")
      .eq("id", userId)
      .single<ProfileRow>();

    if (error) {
     
      return NextResponse.json(
        { error: "Profile fetch failed", details: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(profile);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
