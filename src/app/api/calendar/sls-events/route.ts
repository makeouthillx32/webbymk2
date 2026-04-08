// app/api/calendar/sls-events/route.ts - SLS events for admins + assigned clients only
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

    const { searchParams } = new URL(request.url);
    const start_date = searchParams.get('start_date');
    const end_date = searchParams.get('end_date');
    const user_id = searchParams.get('user_id');
    const user_role = searchParams.get('user_role');

    if (!start_date || !end_date) {
      return NextResponse.json(
        { error: 'start_date and end_date parameters are required' },
        { status: 400 }
      );
    }

    // Get current user's role for access control
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const currentUserRole = userProfile?.role || 'user0x';
    const targetUserId = user_id || user.id;

    console.log('[SLS-API] Getting SLS events for:', { 
      currentUserRole,
      targetUserId, 
      start_date, 
      end_date,
      user_role
    });

    // ACCESS CONTROL: Only admins and assigned clients can see SLS events
    if (currentUserRole !== 'admin1' && currentUserRole !== 'client7x') {
      return NextResponse.json(
        { error: 'Access denied. SLS events are only visible to admins and assigned clients.' },
        { status: 403 }
      );
    }

    // Build the query for SLS events only
    // SLS events are identified by having "SLS" in the title or being a specific event type
    let query = supabase
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
        client_id,
        coach_id,
        event_types!event_type_id (
          name,
          color_code
        )
      `)
      .gte('event_date', start_date)
      .lte('event_date', end_date)
      .is('coach_report_id', null) // Exclude hour log events
      .ilike('title', '%SLS%'); // Filter for SLS events

    // Apply role-based filtering for SLS events
    if (currentUserRole === 'client7x') {
      // Clients can only see SLS events where they are assigned
      query = query.eq('client_id', user.id);
    }
    // Admins see all SLS events (no additional filter)

    // Order by date and time
    query = query.order('event_date', { ascending: true })
                 .order('start_time', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('[SLS-API] Error fetching SLS events:', error);
      return NextResponse.json(
        { error: 'Failed to fetch SLS events' },
        { status: 500 }
      );
    }

    console.log('[SLS-API] Found SLS events:', {
      total: data?.length || 0,
      date_range: `${start_date} to ${end_date}`,
      current_user_role: currentUserRole,
      target_user: targetUserId
    });

    // Fetch user profiles to resolve names
    let userProfiles: any = {};
    
    if (data && data.length > 0) {
      const userIds = [
        ...new Set([
          ...data.map(e => e.client_id).filter(Boolean),
          ...data.map(e => e.coach_id).filter(Boolean)
        ])
      ];
      
      if (userIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, display_name, email')
          .in('id', userIds);
        
        if (profileError) {
          console.warn('[SLS-API] Error fetching profiles:', profileError);
        } else if (profiles) {
          userProfiles = Object.fromEntries(profiles.map(p => [p.id, p]));
          console.log('[SLS-API] Loaded profiles for', Object.keys(userProfiles).length, 'users');
        }
      }
    }

    // Transform the data to match the CalendarEvent interface
    const transformedEvents = data?.map((event: any) => {
      // Get event type info
      const eventType = event.event_types;
      const colorCode = eventType?.color_code || '#8B5CF6'; // Purple for SLS events
      const eventTypeName = eventType?.name || 'SLS Event';

      // Resolve client and coach names from profiles
      const clientProfile = userProfiles[event.client_id];
      const coachProfile = userProfiles[event.coach_id];
      
      const clientName = clientProfile?.display_name || clientProfile?.email || (event.client_id ? 'Unknown Client' : '');
      const coachName = coachProfile?.display_name || coachProfile?.email || (event.coach_id ? 'Unknown Coach' : '');

      return {
        id: event.id,
        title: event.title,
        description: event.description || '',
        event_date: event.event_date,
        start_time: event.start_time,
        end_time: event.end_time,
        event_type: eventTypeName,
        client_name: clientName,
        coach_name: coachName,
        color_code: colorCode,
        status: event.status || 'scheduled',
        location: event.location || '',
        is_virtual: event.is_virtual || false,
        virtual_meeting_link: event.virtual_meeting_link || '',
        duration_minutes: event.duration_minutes || 0,
        priority: event.priority || 'medium',
        notes: event.notes || '',
        // Mark as special SLS events
        is_hour_log: false,
        is_payday: false,
        is_holiday: false,
        is_sales_day: false,
        is_sls_event: true // Custom flag for SLS events
      };
    }) || [];

    return NextResponse.json(transformedEvents);

  } catch (error) {
    console.error('[SLS-API] Unexpected error fetching SLS events:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new SLS event (admins only)
export async function POST(request: NextRequest) {
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

    // Check if user is admin
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userProfile?.role !== 'admin1') {
      return NextResponse.json(
        { error: 'Admin access required to create SLS events' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { 
      title,
      description,
      event_date,
      start_time,
      end_time,
      event_type,
      user_id,
      user_role,
      notes,
      location,
      is_virtual,
      virtual_meeting_link,
      priority,
      created_by_id
    } = body;

    console.log('[SLS-API] Creating SLS event:', {
      title,
      event_date,
      start_time,
      end_time,
      user_id,
      created_by: created_by_id || user.id
    });

    // Validate required fields
    if (!title || !event_date || !start_time || !end_time || !user_id) {
      return NextResponse.json(
        { error: 'Missing required fields: title, event_date, start_time, end_time, user_id' },
        { status: 400 }
      );
    }

    // Get or create SLS event type
    let { data: slsEventType } = await supabase
      .from('event_types')
      .select('id')
      .eq('name', 'SLS Event')
      .single();

    if (!slsEventType) {
      // Create SLS event type if it doesn't exist
      const { data: newEventType, error: eventTypeError } = await supabase
        .from('event_types')
        .insert({
          name: 'SLS Event',
          description: 'Supported Living Services Event',
          color_code: '#8B5CF6',
          is_active: true
        })
        .select('id')
        .single();

      if (eventTypeError) {
        console.error('[SLS-API] Error creating SLS event type:', eventTypeError);
        return NextResponse.json(
          { error: 'Failed to create event type' },
          { status: 500 }
        );
      }
      slsEventType = newEventType;
    }

    // Create the SLS event
    const { data: newEvent, error: insertError } = await supabase
      .from('calendar_events')
      .insert({
        title: title.startsWith('SLS:') ? title : `SLS: ${title}`,
        description: description || notes,
        event_type_id: slsEventType.id,
        client_id: user_role === 'client7x' ? user_id : null,
        coach_id: user_role === 'coachx7' ? user_id : null,
        event_date,
        start_time,
        end_time,
        location: location || '',
        is_virtual: is_virtual || false,
        virtual_meeting_link: virtual_meeting_link || '',
        status: 'scheduled',
        priority: priority || 'medium',
        notes: notes || '',
        created_by: created_by_id || user.id
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('[SLS-API] Error creating SLS event:', insertError);
      return NextResponse.json(
        { error: 'Failed to create SLS event: ' + insertError.message },
        { status: 500 }
      );
    }

    console.log('[SLS-API] ✅ SLS event created successfully:', newEvent.id);

    return NextResponse.json({
      success: true,
      data: newEvent,
      message: `SLS event "${title}" created successfully`
    });

  } catch (error) {
    console.error('[SLS-API] Unexpected error creating SLS event:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}