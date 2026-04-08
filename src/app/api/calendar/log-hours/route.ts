// app/api/calendar/log-hours/route.ts - FIXED to properly handle all database fields
import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// GET - Fetch logged hours for a specific date
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
    const date = searchParams.get('date');
    const coach_id = searchParams.get('coach_id');

    if (!date) {
      return NextResponse.json(
        { error: 'Date parameter is required' },
        { status: 400 }
      );
    }

    // Use coach_id if provided, otherwise use current user
    const targetCoachId = coach_id || user.id;

    console.log('[API] Getting logged hours for:', { date, targetCoachId });

    // Get logged hours for the specific date
    const { data, error } = await supabase
      .from('coach_daily_reports')
      .select('hours_worked, calendar_event_id, activity_type, location, notes, initials')
      .eq('coach_profile_id', targetCoachId)
      .eq('report_date', date)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[API] Error fetching logged hours:', error);
      return NextResponse.json(
        { error: 'Failed to fetch logged hours' },
        { status: 500 }
      );
    }

    const totalHours = data?.hours_worked || 0;
    console.log('[API] Found logged hours:', { 
      totalHours, 
      hasCalendarEvent: !!data?.calendar_event_id,
      activity: data?.activity_type 
    });

    return NextResponse.json({
      totalHours,
      date,
      coach_id: targetCoachId,
      calendar_event_id: data?.calendar_event_id,
      activity_type: data?.activity_type,
      location: data?.location,
      notes: data?.notes,
      initials: data?.initials,
      isLinkedToCalendar: !!data?.calendar_event_id
    });

  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Log new hours for a coach - FIXED all issues
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

    const body = await request.json();
    console.log('[API] Raw request body received:', JSON.stringify(body, null, 2));

    const { 
      report_date,
      hours_worked,
      work_location_id,
      location,
      activity_type,
      notes,
      coach_id,
      coach_name,
      initials
    } = body;

    // Validate required fields
    if (!report_date || !hours_worked || !activity_type) {
      console.error('[API] Missing required fields:', { report_date: !!report_date, hours_worked: !!hours_worked, activity_type: !!activity_type });
      return NextResponse.json(
        { error: 'Missing required fields: report_date, hours_worked, activity_type' },
        { status: 400 }
      );
    }

    if (!work_location_id && (!location || location.trim() === '')) {
      console.error('[API] Missing location data:', { work_location_id, location });
      return NextResponse.json(
        { error: 'Either work_location_id or location text is required' },
        { status: 400 }
      );
    }

    // Validate hours_worked is within acceptable range
    if (hours_worked < 0.25 || hours_worked > 12) {
      return NextResponse.json(
        { error: 'Hours worked must be between 0.25 and 12' },
        { status: 400 }
      );
    }

    // Get user's role to determine profile assignment logic
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const userRole = userProfile?.role || 'user0x';
    const isAdmin = userRole === 'admin1';
    const targetCoachId = coach_id || user.id;

    console.log('[API] User role analysis:', {
      userRole,
      isAdmin,
      currentUserId: user.id,
      targetCoachId,
      isLoggingForSelf: targetCoachId === user.id
    });

    // FIXED: Get location name from work_locations table if work_location_id provided
    let locationName = location; // Default to provided location text
    
    if (work_location_id) {
      const { data: workLocationData } = await supabase
        .from('work_locations')
        .select('location_name, city')
        .eq('id', work_location_id)
        .single();
      
      if (workLocationData) {
        locationName = workLocationData.city 
          ? `${workLocationData.location_name}, ${workLocationData.city}`
          : workLocationData.location_name;
        console.log('[API] Resolved location from work_locations:', locationName);
      }
    }

    // FIXED: Get proper event_type_id from event_types table
    let event_type_id = null;
    
    // First try to find exact match for activity_type
    const { data: eventType } = await supabase
      .from('event_types')
      .select('id, name')
      .ilike('name', activity_type)
      .single();
    
    if (eventType) {
      event_type_id = eventType.id;
      console.log('[API] Found matching event type:', eventType.name, 'ID:', event_type_id);
    } else {
      // Fallback: try to find "Work Hours" or "Hour Log" event type
      const { data: fallbackEventType } = await supabase
        .from('event_types')
        .select('id, name')
        .or('name.ilike.%work%,name.ilike.%hour%,name.ilike.%coaching%')
        .limit(1)
        .single();
      
      if (fallbackEventType) {
        event_type_id = fallbackEventType.id;
        console.log('[API] Using fallback event type:', fallbackEventType.name, 'ID:', event_type_id);
      } else {
        console.warn('[API] No suitable event type found, will create with null event_type_id');
      }
    }

    // FIXED: Proper profile ID assignment logic
    let insertData;
    
    if (isAdmin && targetCoachId !== user.id) {
      // Admin logging hours for another coach
      insertData = {
        coach_profile_id: targetCoachId,  // The coach the hours are for
        admin_profile_id: user.id,        // The admin who logged them
        report_date,
        hours_worked,
        work_location_id: work_location_id || null,
        location: locationName || 'Office', // Use resolved location name
        activity_type,
        notes: notes || null,
        initials: initials || 'Coach',
        created_by: user.id
      };
      console.log('[API] Admin logging hours for coach:', targetCoachId);
    } else if (isAdmin && targetCoachId === user.id) {
      // Admin logging their own hours
      insertData = {
        coach_profile_id: null,           // Admin is not a coach
        admin_profile_id: user.id,        // Admin logging their own hours
        report_date,
        hours_worked,
        work_location_id: work_location_id || null,
        location: locationName || 'Office',
        activity_type,
        notes: notes || null,
        initials: initials || 'Admin',
        created_by: user.id
      };
      console.log('[API] Admin logging their own hours');
    } else {
      // Coach logging their own hours
      insertData = {
        coach_profile_id: user.id,        // Coach logging their own hours
        admin_profile_id: null,           // Not logged by admin
        report_date,
        hours_worked,
        work_location_id: work_location_id || null,
        location: locationName || 'Office',
        activity_type,
        notes: notes || null,
        initials: initials || 'Coach',
        created_by: user.id
      };
      console.log('[API] Coach logging their own hours');
    }

    console.log('[API] About to insert with data:', JSON.stringify(insertData, null, 2));

    // Insert into coach_daily_reports table
    const { data: reportData, error: insertError } = await supabase
      .from('coach_daily_reports')
      .insert(insertData)
      .select('*')
      .single();

    if (insertError) {
      console.error('[API] Supabase insert error:', insertError);
      
      if (insertError.code === '23505' && insertError.message.includes('coach_daily_reports_coach_profile_id_report_date_key')) {
        return NextResponse.json(
          { error: 'Hours already logged for this date. Use update to modify existing entry.' },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: 'Failed to log hours: ' + insertError.message + ' (Code: ' + insertError.code + ')' },
        { status: 500 }
      );
    }

    console.log('[API] ✅ Coach daily report created successfully:', {
      id: reportData.id,
      coach_profile_id: reportData.coach_profile_id,
      admin_profile_id: reportData.admin_profile_id,
      location: reportData.location,
      activity_type: reportData.activity_type
    });

    // FIXED: Create corresponding calendar event with proper linking
    if (event_type_id) {
      const calendarEventData = {
        title: `${initials || 'Work'} - ${hours_worked}h ${activity_type}`,
        description: `Work hours logged: ${hours_worked} hours of ${activity_type}${notes ? '\n\nNotes: ' + notes : ''}`,
        event_type_id,
        client_id: null,
        coach_id: reportData.coach_profile_id, // Link to coach if it's coach hours
        event_date: report_date,
        start_time: '09:00:00',
        end_time: '17:00:00',
        duration_minutes: Math.round(hours_worked * 60),
        location: locationName || 'Office',
        is_virtual: false,
        virtual_meeting_link: null,
        status: 'completed',
        priority: 'low',
        reminder_minutes: null,
        notes: notes || null,
        created_by: user.id,
        coach_report_id: reportData.id // FIXED: Link back to coach daily report
      };

      console.log('[API] Creating calendar event with data:', JSON.stringify(calendarEventData, null, 2));

      const { data: calendarEvent, error: calendarError } = await supabase
        .from('calendar_events')
        .insert(calendarEventData)
        .select('*')
        .single();

      if (calendarError) {
        console.error('[API] Error creating calendar event:', calendarError);
        // Don't fail the whole request, just log the error
      } else {
        console.log('[API] ✅ Calendar event created:', calendarEvent.id);
        
        // Update the coach_daily_reports record with calendar_event_id
        const { error: updateError } = await supabase
          .from('coach_daily_reports')
          .update({ calendar_event_id: calendarEvent.id })
          .eq('id', reportData.id);

        if (updateError) {
          console.error('[API] Error linking calendar event to report:', updateError);
        } else {
          console.log('[API] ✅ Successfully linked calendar event to coach report');
          reportData.calendar_event_id = calendarEvent.id;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: reportData,
      message: `Successfully logged ${hours_worked} hours for ${activity_type}`,
      calendar_event_created: !!reportData.calendar_event_id,
      calendar_event_id: reportData.calendar_event_id,
      location_resolved: locationName
    });

  } catch (error) {
    console.error('[API] Unexpected error logging hours:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

// PUT and DELETE methods would go here...