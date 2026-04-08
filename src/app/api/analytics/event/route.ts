// app/api/analytics/event/route.ts - FIXED FOR DUPLICATE USERS
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

interface EventPayload {
  sessionId: string;
  eventName: string;
  eventCategory?: string;
  eventAction?: string;
  eventLabel?: string;
  eventValue?: number;
  pageUrl?: string;
  metadata?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Parse the request body
    let payload: EventPayload;
    try {
      payload = await request.json();
    } catch (parseError) {
      return NextResponse.json({ 
        error: 'Invalid JSON in request body' 
      }, { status: 400 });
    }
    
    // Validate required fields
    if (!payload.sessionId || !payload.eventName) {
      return NextResponse.json({ 
        error: 'Missing required fields: sessionId, eventName' 
      }, { status: 400 });
    }
    
    // Validate field lengths
    if (payload.eventName.length > 100) {
      return NextResponse.json({ 
        error: 'Event name too long (max 100 characters)' 
      }, { status: 400 });
    }
    
    // ✅ FIXED: Find user by session_id but handle duplicates
    const { data: users, error: userError } = await supabase
      .from('analytics_users')
      .select('id')
      .eq('session_id', payload.sessionId)
      .order('created_at', { ascending: false }) // Get the most recent user first
      .limit(1); // Only get one user
    
    if (userError) {
      console.error('Database error finding user:', userError);
      return NextResponse.json({ 
        error: 'Database error',
        details: userError.message 
      }, { status: 500 });
    }
    
    if (!users || users.length === 0) {
      return NextResponse.json({ 
        error: 'Session not found. Make sure to call /api/analytics/track first.' 
      }, { status: 404 });
    }
    
    // Use the first (most recent) user record
    const user = users[0];
    
    // Validate event value
    if (payload.eventValue !== undefined) {
      if (typeof payload.eventValue !== 'number' || isNaN(payload.eventValue)) {
        return NextResponse.json({ 
          error: 'Event value must be a number' 
        }, { status: 400 });
      }
    }
    
    // Process metadata
    let sanitizedMetadata = null;
    if (payload.metadata && Object.keys(payload.metadata).length > 0) {
      try {
        sanitizedMetadata = JSON.parse(JSON.stringify(payload.metadata));
      } catch (error) {
        return NextResponse.json({ 
          error: 'Invalid metadata format' 
        }, { status: 400 });
      }
    }
    
    // Insert the event
    const { data: eventData, error: eventError } = await supabase
      .from('analytics_events')
      .insert({
        user_id: user.id,
        session_id: payload.sessionId,
        event_name: payload.eventName,
        event_category: payload.eventCategory || null,
        event_action: payload.eventAction || null,
        event_label: payload.eventLabel || null,
        event_value: payload.eventValue || null,
        page_url: payload.pageUrl || null,
        metadata: sanitizedMetadata,
      })
      .select('id, created_at')
      .single();
    
    if (eventError) {
      console.error('Database error creating event:', eventError);
      return NextResponse.json({ 
        error: 'Failed to save event',
        details: eventError.message 
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true,
      eventId: eventData.id,
      timestamp: eventData.created_at,
      userId: user.id
    });
    
  } catch (error) {
    console.error('Unexpected error in event tracking:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Analytics event tracking endpoint',
    status: 'active',
    method: 'POST',
    requiredFields: ['sessionId', 'eventName'],
    optionalFields: ['eventCategory', 'eventAction', 'eventLabel', 'eventValue', 'pageUrl', 'metadata'],
    example: {
      sessionId: 'your-session-id',
      eventName: 'button_click',
      eventCategory: 'engagement',
      eventAction: 'click',
      eventLabel: 'signup_button',
      eventValue: 1,
      pageUrl: '/signup',
      metadata: { buttonColor: 'blue', position: 'header' }
    }
  });
}