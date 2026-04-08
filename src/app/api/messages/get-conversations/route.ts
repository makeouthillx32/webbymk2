// app/api/messages/get-conversations/route.ts (DEBUG VERSION)
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function GET() {
  console.log('🧪 [API DEBUG] get-conversations called');
  
  try {
    const cookieStore = await cookies();
    console.log('🧪 [API DEBUG] Cookies retrieved');

    const getCookie = (name: string) => {
      const cookie = cookieStore.get(name);
      return cookie?.value ?? '';
    };

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return getCookie(name);
          },
          set: () => {},
          remove: () => {},
        },
      }
    );
    console.log('🧪 [API DEBUG] Supabase client created');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    console.log('🧪 [API DEBUG] Auth check result:', {
      hasUser: !!user,
      userId: user?.id,
      userError: userError?.message
    });

    if (userError || !user) {
      console.log('🧪 [API DEBUG] User not authenticated, returning 401');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🧪 [API DEBUG] Calling RPC function with user ID:', user.id);

    const { data, error } = await supabase.rpc('get_user_conversations_with_display_name', {
      p_user_id: user.id,
    });

    console.log('🧪 [API DEBUG] RPC result:', {
      hasData: !!data,
      dataLength: Array.isArray(data) ? data.length : 'not array',
      error: error?.message,
      rawData: data
    });

    if (error) {
      console.error('🧪 [API DEBUG] RPC Error:', error);
      return NextResponse.json({ error: `RPC Failed: ${error.message}` }, { status: 500 });
    }

    console.log('🧪 [API DEBUG] Returning data:', data);
    return NextResponse.json(data || []);
    
  } catch (err) {
    console.error('🧪 [API DEBUG] Unexpected error:', err);
    return NextResponse.json({ 
      error: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}` 
    }, { status: 500 });
  }
}