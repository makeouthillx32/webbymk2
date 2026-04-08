// app/api/messages/start-dm/route.ts

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
  }

  const { userIds } = await req.json();

  if (!Array.isArray(userIds) || userIds.length !== 1) {
    return NextResponse.json({ error: 'Invalid userIds' }, { status: 400 });
  }

  const targetUserId = userIds[0];

  try {
    // Check if a DM already exists
    const { data, error } = await supabase.rpc('find_or_create_dm', {
      p_user1_id: user.id,
      p_user2_id: targetUserId,
    });

    if (error) {
      console.error('RPC error:', error);
      return NextResponse.json({ error: 'Failed to create or find DM' }, { status: 500 });
    }

    // Now check if this channel was already existing
    // We need to determine if the function created a new DM or found an existing one
    
    const { data: channelData, error: channelError } = await supabase
      .from('channels')
      .select('created_at')
      .eq('id', data[0].channel_id)
      .single();
    
    // If the channel was created more than 5 seconds ago, we consider it pre-existing
    const isExisting = channelData && 
                       new Date(channelData.created_at).getTime() < 
                       (Date.now() - 5000);

    // Return both the channel ID and whether it was pre-existing
    return NextResponse.json({
      channelId: data[0].channel_id,
      isExisting: isExisting || false
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
