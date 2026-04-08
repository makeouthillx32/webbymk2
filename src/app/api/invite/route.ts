// app/api/invite/route.ts
import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies, headers });

  // join roles on role_id to get the actual role name
  const { data, error } = await supabase
    .from('invites')
    .select(`
      code,
      role_id,
      roles!role_id (
        role
      ),
      created_at,
      max_uses,
      expires_at,
      inviter_id,
      profiles!inviter_id (
        avatar_url
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('GET /api/invite error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const defaultAvatarUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/default-avatar.png`;

  const invites = (data ?? []).map((i) => ({
    code:       i.code,
    role:       i.roles?.[0]?.role ?? i.role_id,      // decoded role name
    inviter: {
      name:   i.inviter_id,                           // still fallback to UUID
      avatar: i.profiles?.[0]?.avatar_url || defaultAvatarUrl
    },
    uses:       0,
    max_uses:   i.max_uses,
    expires_at: i.expires_at
  }));

  return NextResponse.json(invites);
}
