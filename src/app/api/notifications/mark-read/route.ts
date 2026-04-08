// app/api/notifications/mark-read/route.ts
import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { notificationIds } = await request.json();
    
    if (!notificationIds || !Array.isArray(notificationIds)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    
    // Update notifications to mark as read
    await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', notificationIds)
      .eq('receiver_id', user.id);
      
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}