import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  const { role } = await req.json();
  const supabase = createServerActionClient({ cookies });

  // 1. Look up role ID
  const { data: roleData, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("role", role)
    .single();

  if (roleError || !roleData) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // 2. Create invite
  const code = randomUUID();
  const { error: insertError } = await supabase.from("invites").insert([
    { code, role_id: roleData.id }
  ]);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // 3. Generate invite link with `role` param included for Open Graph preview
  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/sign-up?invite=${code}&role=${role}`;

  return NextResponse.json({ inviteLink: url });
}