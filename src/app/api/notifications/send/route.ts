// app/api/messages/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const {
    channel_id,
    content,
  }: {
    channel_id: string;
    content: string;
  } = await req.json();

  // 1️⃣ Authenticate
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2️⃣ Insert the message
  const { error: insertError } = await supabase
    .from('messages')
    .insert({ channel_id, sender_id: user.id, content });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // 3️⃣ Get channel participants (exclude the sender)
  const { data: participants, error: participantsError } = await supabase
    .from('channel_participants')
    .select('user_id')
    .eq('channel_id', channel_id)
    .neq('user_id', user.id);

  if (participantsError) {
    console.error('Failed to fetch channel participants:', participantsError.message);
  }

  // 4️⃣ Get sender display name
  const metadata = (user.user_metadata as Record<string, any>) || {};
  const displayName =
    metadata.display_name ||
    metadata.full_name ||
    user.email?.split('@')[0] ||
    'Someone';

  // 5️⃣ Create/update stacked notifications for each recipient
  if (participants && participants.length > 0) {
    for (const participant of participants) {
      // Check if there's already a recent notification from this sender to this recipient
      const { data: existingNotification, error: checkError } = await supabase
        .from('notifications')
        .select('id, title')
        .eq('receiver_id', participant.user_id)
        .eq('sender_id', user.id)
        .like('title', `%sent you%message%`) // Match message notifications
        .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Within last 5 minutes
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking existing notifications:', checkError);
        continue;
      }

      if (existingNotification) {
        // Update existing notification with message count
        const currentTitle = existingNotification.title;
        let newTitle: string;
        
        // Extract current count if it exists
        const countMatch = currentTitle.match(/^(\d+)\s/);
        if (countMatch) {
          // Already has a count, increment it
          const currentCount = parseInt(countMatch[1]);
          const newCount = currentCount + 1;
          newTitle = `${newCount} ${displayName} sent you messages`;
        } else {
          // First stacked message
          newTitle = `2 ${displayName} sent you messages`;
        }

        const { error: updateError } = await supabase
          .from('notifications')
          .update({
            title: newTitle,
            subtitle: `Latest: ${content.length > 50 ? content.slice(0, 50) + '...' : content}`,
            created_at: new Date().toISOString(), // Update timestamp to keep it fresh
          })
          .eq('id', existingNotification.id);

        if (updateError) {
          console.error('Failed to update notification:', updateError);
        } else {
          console.log(`Updated stacked notification for ${participant.user_id}`);
        }
      } else {
        // Create new notification
        const { error: insertError } = await supabase
          .from('notifications')
          .insert({
            sender_id: user.id,
            receiver_id: participant.user_id,
            title: `${displayName} sent you a message`,
            subtitle: content.length > 50 ? content.slice(0, 50) + '...' : content,
            action_url: `/messages/${channel_id}`,
            image_url: null,
          });

        if (insertError) {
          console.error('Failed to create notification:', insertError);
        } else {
          console.log(`Created new notification for ${participant.user_id}`);
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}