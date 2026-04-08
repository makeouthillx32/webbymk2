// app/api/analytics/track/route.ts - DEBUG VERSION WITH DETAILED ERRORS
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

interface TrackingPayload {
  pageUrl: string;
  pageTitle?: string;
  referrer?: string;
  userAgent: string;
  sessionId: string;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
  timezone?: string;
  loadTime?: number;
  utmParams?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
}

// Helper functions for user agent parsing
function detectDeviceType(userAgent: string): string {
  if (!userAgent) return 'unknown';
  
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipod') || ua.includes('blackberry') || ua.includes('windows phone')) {
    return 'mobile';
  }
  if (ua.includes('tablet') || ua.includes('ipad')) {
    return 'tablet';
  }
  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider') || ua.includes('scraper')) {
    return 'bot';
  }
  
  return 'desktop';
}

function extractBrowser(userAgent: string): string {
  if (!userAgent) return 'unknown';
  
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('chrome') && !ua.includes('edge') && !ua.includes('edg')) return 'Chrome';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('edge') || ua.includes('edg')) return 'Edge';
  if (ua.includes('opera') || ua.includes('opr')) return 'Opera';
  
  return 'unknown';
}

function extractOS(userAgent: string): string {
  if (!userAgent) return 'unknown';
  
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'macOS';
  if (ua.includes('linux') && !ua.includes('android')) return 'Linux';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'iOS';
  
  return 'unknown';
}

function detectBot(userAgent: string): boolean {
  if (!userAgent) return false;
  
  const ua = userAgent.toLowerCase();
  const botPatterns = ['bot', 'crawler', 'spider', 'scraper', 'fetch', 'curl', 'wget', 'slurp'];
  
  return botPatterns.some(pattern => ua.includes(pattern));
}

export async function POST(request: NextRequest) {
  console.log('🚀 [TRACK] Starting analytics tracking request');
  
  try {
    const supabase = await createClient();
    const payload: TrackingPayload = await request.json();
    
    console.log('📝 [TRACK] Payload received:', {
      sessionId: payload.sessionId,
      pageUrl: payload.pageUrl,
      userAgent: payload.userAgent?.substring(0, 50) + '...',
    });
    
    // Validate required fields
    if (!payload.sessionId || !payload.pageUrl || !payload.userAgent) {
      console.error('❌ [TRACK] Missing required fields:', { 
        hasSessionId: !!payload.sessionId,
        hasPageUrl: !!payload.pageUrl,
        hasUserAgent: !!payload.userAgent
      });
      return NextResponse.json({ 
        error: 'Missing required fields: sessionId, pageUrl, userAgent' 
      }, { status: 400 });
    }
    
    // Get client IP address
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     request.headers.get('x-real-ip') || 
                     request.ip ||
                     '127.0.0.1';
    
    console.log('🌐 [TRACK] Client IP:', clientIP);
    
    // Extract device and browser information
    const deviceType = detectDeviceType(payload.userAgent);
    const browser = extractBrowser(payload.userAgent);
    const os = extractOS(payload.userAgent);
    const isBot = detectBot(payload.userAgent);
    
    console.log('🖥️ [TRACK] Device info:', { deviceType, browser, os, isBot });
    
    // STEP 1: Find or create user
    let userId: string;
    
    console.log('👤 [TRACK] Looking for existing user with session:', payload.sessionId);
    
    const { data: existingUsers, error: userSelectError } = await supabase
      .from('analytics_users')
      .select('id, created_at')
      .eq('session_id', payload.sessionId)
      .order('created_at', { ascending: false })
      .limit(5); // Get up to 5 to see if there are duplicates
    
    if (userSelectError) {
      console.error('❌ [TRACK] Error selecting user:', userSelectError);
      return NextResponse.json({ 
        error: 'Database error - user lookup failed',
        details: userSelectError.message 
      }, { status: 500 });
    }
    
    console.log(`📊 [TRACK] Found ${existingUsers?.length || 0} users with this session ID`);
    if (existingUsers && existingUsers.length > 1) {
      console.warn('⚠️ [TRACK] Multiple users found for same session - this indicates duplicate user issue');
      existingUsers.forEach((user, index) => {
        console.log(`  User ${index + 1}: ID=${user.id}, Created=${user.created_at}`);
      });
    }
    
    if (existingUsers && existingUsers.length > 0) {
      // Use the most recent user record
      userId = existingUsers[0].id;
      console.log('✅ [TRACK] Using existing user:', userId);
      
      // Update user's last_seen and other info
      const { error: updateError } = await supabase
        .from('analytics_users')
        .update({
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          screen_width: payload.screenWidth || null,
          screen_height: payload.screenHeight || null,
          language: payload.language || null,
          timezone: payload.timezone || null,
        })
        .eq('id', userId);
      
      if (updateError) {
        console.error('⚠️ [TRACK] Error updating user (non-critical):', updateError);
      } else {
        console.log('✅ [TRACK] User updated successfully');
      }
    } else {
      console.log('👤 [TRACK] Creating new user');
      
      // Create new user
      const { data: newUser, error: userError } = await supabase
        .from('analytics_users')
        .insert({
          user_agent: payload.userAgent,
          ip_address: clientIP,
          session_id: payload.sessionId,
          device_type: deviceType,
          browser: browser,
          os: os,
          is_bot: isBot,
          screen_width: payload.screenWidth || null,
          screen_height: payload.screenHeight || null,
          language: payload.language || null,
          timezone: payload.timezone || null,
        })
        .select('id')
        .single();
      
      if (userError) {
        console.error('❌ [TRACK] Error creating user:', userError);
        return NextResponse.json({ 
          error: 'Database error - user creation failed',
          details: userError.message 
        }, { status: 500 });
      }
      
      userId = newUser.id;
      console.log('✅ [TRACK] New user created:', userId);
    }
    
    // STEP 2: Handle session
    console.log('📅 [TRACK] Looking for existing session');
    
    const { data: existingSessions, error: sessionSelectError } = await supabase
      .from('analytics_sessions')
      .select('id, entry_page, created_at')
      .eq('session_id', payload.sessionId)
      .order('created_at', { ascending: false })
      .limit(5); // Get up to 5 to see if there are duplicates
    
    if (sessionSelectError) {
      console.error('❌ [TRACK] Error selecting session:', sessionSelectError);
      // Don't fail the request for session errors
    } else {
      console.log(`📊 [TRACK] Found ${existingSessions?.length || 0} sessions with this session ID`);
      
      if (!existingSessions || existingSessions.length === 0) {
        console.log('📅 [TRACK] Creating new session');
        
        const { error: sessionError } = await supabase
          .from('analytics_sessions')
          .insert({
            session_id: payload.sessionId,
            user_id: userId,
            entry_page: payload.pageUrl,
            device_type: deviceType,
            browser: browser,
            os: os,
            referrer: payload.referrer || null,
            utm_source: payload.utmParams?.source || null,
            utm_medium: payload.utmParams?.medium || null,
            utm_campaign: payload.utmParams?.campaign || null,
          });
        
        if (sessionError) {
          console.error('⚠️ [TRACK] Error creating session (non-critical):', sessionError);
        } else {
          console.log('✅ [TRACK] New session created');
        }
      } else {
        console.log('✅ [TRACK] Using existing session:', existingSessions[0].id);
        
        // Update existing session
        const existingSession = existingSessions[0];
        const { error: updateError } = await supabase
          .from('analytics_sessions')
          .update({
            end_time: new Date().toISOString(),
            exit_page: payload.pageUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSession.id);
        
        if (updateError) {
          console.error('⚠️ [TRACK] Error updating session (non-critical):', updateError);
        } else {
          console.log('✅ [TRACK] Session updated');
        }
      }
    }
    
    // STEP 3: Create page view record
    console.log('📄 [TRACK] Creating page view record');
    
    const pageViewData = {
      user_id: userId,
      session_id: payload.sessionId,
      page_url: payload.pageUrl,
      page_title: payload.pageTitle || null,
      referrer: payload.referrer || null,
      utm_source: payload.utmParams?.source || null,
      utm_medium: payload.utmParams?.medium || null,
      utm_campaign: payload.utmParams?.campaign || null,
      utm_term: payload.utmParams?.term || null,
      utm_content: payload.utmParams?.content || null,
      load_time: payload.loadTime || null,
    };
    
    console.log('📝 [TRACK] Page view data:', pageViewData);
    
    const { error: pageViewError } = await supabase
      .from('analytics_page_views')
      .insert(pageViewData);
    
    if (pageViewError) {
      console.error('❌ [TRACK] Error creating page view:', pageViewError);
      return NextResponse.json({ 
        error: 'Database error - page view creation failed',
        details: pageViewError.message 
      }, { status: 500 });
    }
    
    console.log('✅ [TRACK] Page view created successfully');
    
    // Return success
    const response = { 
      success: true, 
      userId,
      deviceType,
      browser,
      os
    };
    
    console.log('🎉 [TRACK] Analytics tracking completed successfully:', response);
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('💥 [TRACK] Unexpected error in analytics tracking:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint for testing
export async function GET() {
  return NextResponse.json({
    message: 'Analytics tracking endpoint is active',
    endpoints: {
      POST: 'Track page views and sessions',
    }
  });
}