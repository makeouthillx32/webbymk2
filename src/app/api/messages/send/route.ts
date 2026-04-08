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

  console.log('🔥 MESSAGE SEND STARTED:', { channel_id, content: content.slice(0, 20) + '...' });

  // 1️⃣ Authenticate
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    console.log('🔥 AUTH FAILED:', authError?.message);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('🔥 USER AUTHENTICATED:', user.id);

  // 2️⃣ Insert the message
  const { error: insertError } = await supabase
    .from('messages')
    .insert({ channel_id, sender_id: user.id, content });
  if (insertError) {
    console.log('🔥 MESSAGE INSERT FAILED:', insertError.message);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  console.log('🔥 MESSAGE INSERTED SUCCESSFULLY');

  // 3️⃣ Call notification API with the EXACT same data the SQL trigger would have
  try {
    console.log('🔥 CALLING NOTIFICATION API...');
    
    // Call our notification API internally (same server)
    const notificationApiUrl = `${req.nextUrl.origin}/api/notifications/create-message`;
    
    const notificationPayload = {
      channel_id: channel_id,
      sender_id: user.id,  // This is NEW.sender_id from the SQL trigger
      content: content     // This is NEW.content from the SQL trigger
    };
    
    console.log('🔥 NOTIFICATION PAYLOAD:', notificationPayload);
    
    const notificationResponse = await fetch(notificationApiUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // Forward cookies for authentication
        'Cookie': req.headers.get('cookie') || '',
      },
      body: JSON.stringify(notificationPayload)
    });
    
    const responseText = await notificationResponse.text();
    console.log('🔥 NOTIFICATION API RESPONSE STATUS:', notificationResponse.status);
    console.log('🔥 NOTIFICATION API RESPONSE:', responseText);
    
    if (!notificationResponse.ok) {
      console.error('🔥 NOTIFICATION API FAILED');
      // Don't fail the message send, just log the error
    } else {
      console.log('🔥 NOTIFICATION API SUCCESS');
    }
  } catch (error) {
    console.error('🔥 NOTIFICATION API ERROR:', error);
    // Don't fail the message send, just log the error
  }

  console.log('🔥 MESSAGE SEND COMPLETED');
  return NextResponse.json({ success: true });
}