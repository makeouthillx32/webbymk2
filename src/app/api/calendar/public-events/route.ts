// app/api/calendar/public-events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user (still need auth to prevent abuse, but role doesn't matter)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[Public Events API] Auth error:', userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const start_date = searchParams.get('start_date');
    const end_date = searchParams.get('end_date');

    if (!start_date || !end_date) {
      return NextResponse.json(
        { error: 'start_date and end_date are required' }, 
        { status: 400 }
      );
    }

    console.log('[Public Events API] Fetching public events for date range:', {
      start_date,
      end_date
    });

    // Fetch public events - these are events with NO specific coach_id or client_id
    // This includes: PD (paydays), holidays, company meetings, announcements, etc.
    const { data: events, error } = await supabase
      .from('calendar_events')
      .select(`
        id,
        title,
        description,
        event_date,
        start_time,
        end_time,
        duration_minutes,
        location,
        is_virtual,
        virtual_meeting_link,
        status,
        priority,
        notes,
        created_at,
        event_types!inner(
          id,
          name,
          color_code
        )
      `)
      .gte('event_date', start_date)
      .lte('event_date', end_date)
      .is('coach_id', null)  // No specific coach assigned
      .is('client_id', null) // No specific client assigned
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      console.error('[Public Events API] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch public events' }, 
        { status: 500 }
      );
    }

    console.log(`[Public Events API] Found ${events?.length || 0} public events`);

    // Transform the data to match the expected format
    const transformedEvents = (events || []).map(event => ({
      id: event.id,
      title: event.title,
      description: event.description,
      event_date: event.event_date,
      start_time: event.start_time,
      end_time: event.end_time,
      duration_minutes: event.duration_minutes,
      location: event.location,
      is_virtual: event.is_virtual,
      virtual_meeting_link: event.virtual_meeting_link,
      status: event.status,
      priority: event.priority,
      notes: event.notes,
      event_type: event.event_types?.name || 'Unknown',
      color_code: event.event_types?.color_code || '#3B82F6',
      client_name: null, // Public events don't have specific clients
      coach_name: null,  // Public events don't have specific coaches
      client_id: null,
      coach_id: null,
      created_at: event.created_at,
      is_hour_log: false, // These are regular calendar events, not hour logs
      is_public: true     // Flag to identify these as public events
    }));

    // Log event types found for debugging
    const eventTypes = [...new Set(transformedEvents.map(e => e.event_type))];
    console.log('[Public Events API] Event types found:', eventTypes);

    return NextResponse.json(transformedEvents);

  } catch (error) {
    console.error('[Public Events API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}