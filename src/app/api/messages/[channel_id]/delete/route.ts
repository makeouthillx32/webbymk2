// app/api/messages/[channel_id]/delete/route.ts (FIXED for Next.js 15)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ channel_id: string }> }
) {
  try {
    // FIXED: Await cookies() and params in Next.js 15
    const cookieStore = await cookies();
    const params = await context.params;

    console.log('🗑️ [DELETE API] Starting delete conversation request');
    console.log('🗑️ [DELETE API] Params received:', params);

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

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
      console.error('🗑️ [DELETE API] Authentication error:', authError);
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    console.log('🗑️ [DELETE API] User authenticated:', user.id.substring(0, 8) + '...');

    // FIXED: Extract channel_id properly
    const channelId = params.channel_id;
    
    console.log('🗑️ [DELETE API] Channel ID extracted:', {
      channelId,
      type: typeof channelId,
      isString: typeof channelId === 'string'
    });
    
    if (!channelId || typeof channelId !== 'string') {
      console.error('🗑️ [DELETE API] Invalid channel ID:', channelId);
      return NextResponse.json(
        { error: "Invalid or missing channel ID" },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(channelId)) {
      console.error('🗑️ [DELETE API] Invalid UUID format:', channelId);
      return NextResponse.json(
        { error: "Invalid channel ID format" },
        { status: 400 }
      );
    }
    
    console.log("🗑️ [DELETE API] Deleting conversation:", {
      channelId,
      userId: user.id
    });
    
    // Call the PostgreSQL function to delete the conversation
    const { data, error } = await supabase.rpc("delete_conversation", {
      p_channel_id: channelId,
      p_user_id: user.id
    });

    console.log('🗑️ [DELETE API] Supabase RPC response:', { data, error });

    if (error) {
      console.error("🗑️ [DELETE API] Failed to delete conversation:", error);
      return NextResponse.json({ 
        error: `Failed to delete conversation: ${error.message}` 
      }, { status: 500 });
    }

    // Check if the function returned success
    if (!data || !data.success) {
      const errorMessage = data?.error || 'Unknown error occurred';
      console.error("🗑️ [DELETE API] Function returned error:", errorMessage);
      return NextResponse.json({ error: errorMessage }, { status: 403 });
    }

    console.log("🗑️ [DELETE API] ✅ Conversation deleted successfully:", data);
    
    // Optional: Clean up storage files if we have attachment URLs
    if (data.message_ids && data.message_ids.length > 0) {
      try {
        console.log(`🗑️ [DELETE API] Cleaning up ${data.message_ids.length} message attachments`);
        
        // Get all attachment file URLs for cleanup
        const { data: attachments } = await supabase
          .from('message_attachments')
          .select('file_url')
          .in('message_id', data.message_ids);
        
        // Extract file paths from URLs and delete from storage
        if (attachments && attachments.length > 0) {
          const filePaths = attachments
            .map(att => {
              try {
                // Extract path from URL like: /storage/v1/object/public/attachments/filename.jpg
                const url = new URL(att.file_url);
                return url.pathname.replace('/storage/v1/object/public/attachments/', '');
              } catch (e) {
                console.warn('🗑️ [DELETE API] Invalid attachment URL:', att.file_url);
                return null;
              }
            })
            .filter((path): path is string => path !== null && path.length > 0);
          
          if (filePaths.length > 0) {
            const { error: storageError } = await supabase.storage
              .from('attachments')
              .remove(filePaths);
            
            if (storageError) {
              console.error('🗑️ [DELETE API] Failed to delete some storage files:', storageError);
              // Don't fail the request, just log the warning
            } else {
              console.log(`🗑️ [DELETE API] ✅ Deleted ${filePaths.length} files from storage`);
            }
          }
        }
      } catch (storageErr) {
        console.error('🗑️ [DELETE API] Error during storage cleanup:', storageErr);
        // Don't fail the request, storage cleanup is optional
      }
    }
    
    return NextResponse.json({
      success: true,
      message: data.message || 'Conversation deleted successfully',
      channelId: data.channel_id,
      channelName: data.channel_name,
      deletedAt: data.deleted_at
    });
    
  } catch (error: any) {
    console.error("🗑️ [DELETE API] Unexpected error in delete conversation route:", error);
    return NextResponse.json(
      { 
        error: "An unexpected error occurred: " + (error.message || "Unknown error"),
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}