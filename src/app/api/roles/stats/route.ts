// app/api/roles/stats/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const ROLE_ORDER = ["admin", "job_coach", "client"] as const;
type RoleType = (typeof ROLE_ORDER)[number];

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

//   // Only admins can view role stats (matches your goal)
//   const { data: me } = await supabase
//     .from("profiles")
//     .select("role")
//     .eq("id", user.id)
//     .single();

//   if (!me || me.role !== "admin") {
//     return NextResponse.json({ error: "Forbidden" }, { status: 403 });
//   }

  // Fetch roles and count in JS (simple + reliable)
  const { data: rows, error } = await supabase
    .from("profiles")
    .select("role");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts: Record<RoleType, number> = {
    admin: 0,
    job_coach: 0,
    client: 0,
  };

  for (const r of rows ?? []) {
    const role = r.role as RoleType;
    if (role in counts) counts[role] += 1;
  }

  return NextResponse.json({
    roles: ROLE_ORDER.map((role) => ({ role, count: counts[role] })),
  });
}
