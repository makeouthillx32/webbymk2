// app/api/messages/[channel_id]/route.ts (FIXED for Next.js 15)

import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Ensures dynamic route works in all environments

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ channel_id: string }> }
) {
  try {
    console.log('📨 [MESSAGES API] Starting fetch messages request');
    
    // FIXED: Await params in Next.js 15
    const params = await context.params;
    const channel_id = params?.channel_id;

    console.log('📨 [MESSAGES API] Channel ID:', {
      channel_id,
      type: typeof channel_id,
      isString: typeof channel_id === 'string'
    });

    if (!channel_id || typeof channel_id !== 'string') {
      console.error('📨 [MESSAGES API] Missing or invalid channel_id:', channel_id);
      return NextResponse.json({ error: 'Missing or invalid channel_id' }, { status: 400 });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(channel_id)) {
      console.error('📨 [MESSAGES API] Invalid UUID format:', channel_id);
      return NextResponse.json({ error: 'Invalid channel ID format' }, { status: 400 });
    }

    // Create Supabase client
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('📨 [MESSAGES API] Authentication error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('📨 [MESSAGES API] User authenticated:', user.id.substring(0, 8) + '...');

    // Check if user has access to this channel using your schema
    const { data: channelAccess, error: accessError } = await supabase
      .from('channel_participants')
      .select('channel_id, role')
      .eq('channel_id', channel_id)
      .eq('user_id', user.id)
      .maybeSingle(); // Use maybeSingle instead of single to handle no results gracefully

    if (accessError) {
      console.error('📨 [MESSAGES API] Error checking channel access:', accessError);
      return NextResponse.json({ error: 'Failed to verify channel access' }, { status: 500 });
    }

    if (!channelAccess) {
      console.log('📨 [MESSAGES API] User does not have access to channel:', channel_id);
      return NextResponse.json({ error: 'Access denied to this channel' }, { status: 403 });
    }

    console.log('📨 [MESSAGES API] Channel access verified, role:', channelAccess.role);

    // Try to use RPC function first
    console.log('📨 [MESSAGES API] Calling get_channel_messages RPC...');
    
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_channel_messages', {
      p_channel_id: channel_id,
      p_user_id: user.id,
      p_limit: 50,
      p_before_id: null,
    });

    if (rpcError) {
      console.error('📨 [MESSAGES API] RPC error:', rpcError.message);
      
      // Fallback to direct query if RPC fails - using your exact schema
      console.log('📨 [MESSAGES API] Falling back to direct query...');
      
      const { data: directData, error: directError } = await supabase
        .from('messages')
        .select(`
          id,
          content,
          created_at,
          sender_id
        `)
        .eq('channel_id', channel_id)
        .order('created_at', { ascending: true })
        .limit(50);

      if (directError) {
        console.error('📨 [MESSAGES API] Direct query error:', directError);
        return NextResponse.json({ error: 'Failed to fetch messages.' }, { status: 500 });
      }

      console.log(`📨 [MESSAGES API] ✅ Direct query successful: ${directData?.length || 0} messages`);

      // Handle empty result
      if (!directData || directData.length === 0) {
        console.log('📨 [MESSAGES API] No messages found for channel:', channel_id);
        return NextResponse.json([]);
      }

      // Get user profiles for all senders in one query
      const senderIds = [...new Set(directData.map(msg => msg.sender_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, email, avatar_url')
        .in('id', senderIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Transform direct query data to match expected format
      const messages = directData.map((msg: any) => {
        const profile = profileMap.get(msg.sender_id);
        return {
          id: msg.id,
          content: msg.content || '',
          timestamp: msg.created_at,
          sender: {
            id: msg.sender_id,
            name: profile?.display_name || 'Unknown User',
            email: profile?.email || '',
            avatar: profile?.avatar_url || profile?.display_name?.charAt(0)?.toUpperCase() || 'U',
          },
          isEdited: false,
          reactions: [],
          attachments: [],
          likes: 0,
          image: null,
        };
      });

      return NextResponse.json(messages);
    }

    // RPC was successful
    console.log(`📨 [MESSAGES API] ✅ RPC successful: ${rpcData?.length || 0} messages`);

    const messages = (rpcData ?? []).map((row: any) => ({
      id: row.message_id,
      content: row.content || '',
      timestamp: row.created_at,
      sender: {
        id: row.sender_id,
        name: row.sender_name,
        email: row.sender_email,
        avatar: row.sender_avatar_url || row.sender_name?.charAt(0)?.toUpperCase() || 'U',
      },
      isEdited: row.is_edited,
      reactions: row.reactions || [],
      attachments: row.attachments || [],
      likes: 0,
      image: null,
    }));

    return NextResponse.json(messages);

  } catch (error: any) {
    console.error('📨 [MESSAGES API] Unexpected error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }, 
      { status: 500 }
    );
  }
}