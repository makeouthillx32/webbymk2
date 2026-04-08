// app/api/apply-invite/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { invite } = await req.json();
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No authenticated user" }, { status: 401 });
  }

  // 1. Find invite
  const { data: inviteData, error: inviteError } = await supabase
    .from('invites')
    .select('role_id, code')
    .eq('code', invite)
    .single();

  if (inviteError || !inviteData) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
  }

  // 2. Get role name
  const { data: roleData } = await supabase
    .from('roles')
    .select('role')
    .eq('id', inviteData.role_id)
    .single();

  if (!roleData) {
    return NextResponse.json({ error: "Role not found" }, { status: 400 });
  }

  // 3. Update user profile with role
  await supabase
    .from('profiles')
    .update({ role: roleData.role })
    .eq('id', user.id);

  // 4. Fetch specializations attached to the invite
  const { data: specializations } = await supabase
    .from('invite_specializations')
    .select('specialization_id, created_by')
    .eq('invite_code', invite);

  // 5. Manually insert specializations (if any)
  if (specializations && specializations.length > 0) {
    const inserts = specializations.map((spec) => ({
      user_id: user.id,
      specialization_id: spec.specialization_id,
      assigned_by: spec.created_by,
    }));

    await supabase.from('user_specializations').insert(inserts);
  }

  // 6. Delete invite after use
  await supabase
    .from('invites')
    .delete()
    .eq('code', invite);

  return NextResponse.json({ success: true });
}