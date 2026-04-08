// app/api/messages/start-group/route.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const cookieStore = cookies();

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

  try {
    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
      console.error('Authentication error:', authError);
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    // Parse request body
    const { name, participantIds } = await request.json();
    
    if (!name || !participantIds || !Array.isArray(participantIds)) {
      return NextResponse.json(
        { error: "Group name and participant IDs array are required" },
        { status: 400 }
      );
    }
    
    // Ensure creator is included in participants (though our function handles this too)
    const allParticipantIds = [...new Set([...participantIds])];
    
    console.log("Creating group with:", {
      creator: user.id,
      name,
      participants: allParticipantIds
    });
    
    // Call the Postgres function to create or get a group channel
    const { data, error } = await supabase.rpc("create_or_get_group_channel", {
      p_creator_id: user.id,
      p_channel_name: name,
      p_participant_ids: allParticipantIds
    });

    if (error) {
      console.error("Failed to create group channel:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log("Group channel created/found with ID:", data);
    
    // Check if this is a group channel and set default avatar if needed
    const { data: channelData, error: channelError } = await supabase
      .from('channels')
      .select('type_id, avatar_url')
      .eq('id', data)
      .single();
    
    if (channelError) {
      console.error("Failed to fetch channel data:", channelError);
    } else {
      // Only set default avatar for group chats (assuming type_id > 1 means group)
      // and only if no avatar is already set
      if (channelData.type_id > 1 && !channelData.avatar_url) {
        const defaultGroupAvatarUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/default-group.png`;
        
        const { error: updateError } = await supabase
          .from('channels')
          .update({ avatar_url: defaultGroupAvatarUrl })
          .eq('id', data);
        
        if (updateError) {
          console.error("Failed to set default group avatar:", updateError);
          // Don't fail the request, just log the error
        } else {
          console.log("Default group avatar set successfully");
        }
      }
    }
    
    // Return just the channel ID as a simple string to match the format
    // expected by the frontend component
    return NextResponse.json({ channelId: data });
    
  } catch (error: any) {
    console.error("Unexpected error in start-group route:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}