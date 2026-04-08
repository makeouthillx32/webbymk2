// app/api/calendar/event-types/route.ts - Fetch event types for color mapping
import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Event-Types-API] Fetching event types...');

    // Fetch all active event types
    const { data, error } = await supabase
      .from('event_types')
      .select('id, name, description, color_code, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[Event-Types-API] Error fetching event types:', error);
      return NextResponse.json(
        { error: 'Failed to fetch event types' },
        { status: 500 }
      );
    }

    console.log('[Event-Types-API] Found event types:', {
      total: data?.length || 0,
      types: data?.map(t => t.name).join(', ')
    });

    // Transform to a more usable format
    const eventTypes = data?.map(type => ({
      id: type.id,
      name: type.name,
      description: type.description || '',
      color_code: type.color_code || '#3B82F6',
      is_active: type.is_active
    })) || [];

    return NextResponse.json(eventTypes);

  } catch (error) {
    console.error('[Event-Types-API] Unexpected error fetching event types:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}