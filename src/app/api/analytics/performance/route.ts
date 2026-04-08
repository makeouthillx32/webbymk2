// app/api/analytics/performance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

interface PerformancePayload {
  sessionId: string;
  pageUrl: string;
  metrics: {
    type: 'LCP' | 'FID' | 'CLS' | 'TTFB' | 'FCP' | 'INP';
    value: number;
  }[];
}

// Validate performance metric values
function validateMetric(type: string, value: number): boolean {
  if (isNaN(value) || value < 0) return false;
  
  switch (type) {
    case 'LCP': // Largest Contentful Paint (ms)
      return value <= 30000; // Max 30 seconds
    case 'FID': // First Input Delay (ms) 
      return value <= 5000; // Max 5 seconds
    case 'CLS': // Cumulative Layout Shift (score)
      return value <= 10; // Reasonable upper bound
    case 'TTFB': // Time to First Byte (ms)
      return value <= 30000; // Max 30 seconds
    case 'FCP': // First Contentful Paint (ms)
      return value <= 30000; // Max 30 seconds
    case 'INP': // Interaction to Next Paint (ms)
      return value <= 10000; // Max 10 seconds
    default:
      return true; // Allow other metric types
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const payload: PerformancePayload = await request.json();
    
    // Validate required fields
    if (!payload.sessionId || !payload.pageUrl || !payload.metrics || !Array.isArray(payload.metrics)) {
      return NextResponse.json({ 
        error: 'Missing required fields: sessionId, pageUrl, metrics (array)' 
      }, { status: 400 });
    }
    
    // Validate metrics array
    if (payload.metrics.length === 0) {
      return NextResponse.json({ 
        error: 'Metrics array cannot be empty' 
      }, { status: 400 });
    }
    
    // Validate each metric
    for (const metric of payload.metrics) {
      if (!metric.type || typeof metric.value !== 'number') {
        return NextResponse.json({ 
          error: 'Each metric must have type and numeric value' 
        }, { status: 400 });
      }
      
      if (!validateMetric(metric.type, metric.value)) {
        return NextResponse.json({ 
          error: `Invalid ${metric.type} value: ${metric.value}` 
        }, { status: 400 });
      }
    }
    
    // Find the user by session_id
    const { data: user, error: userError } = await supabase
      .from('analytics_users')
      .select('id, device_type, browser')
      .eq('session_id', payload.sessionId)
      .maybeSingle();
    
    if (userError) {
      console.error('Error finding user:', userError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    
    if (!user) {
      return NextResponse.json({ 
        error: 'Session not found. Please track a page view first.' 
      }, { status: 404 });
    }
    
    // Create performance records for each metric
    const performanceRecords = payload.metrics.map(metric => ({
      user_id: user.id,
      session_id: payload.sessionId,
      page_url: payload.pageUrl,
      metric_type: metric.type,
      metric_value: metric.value,
      device_type: user.device_type || 'unknown',
      browser: user.browser || 'unknown',
    }));
    
    const { error: performanceError } = await supabase
      .from('analytics_performance')
      .insert(performanceRecords);
    
    if (performanceError) {
      console.error('Error creating performance metrics:', performanceError);
      return NextResponse.json({ 
        error: 'Failed to track performance metrics',
        details: performanceError.message 
      }, { status: 500 });
    }
    
    // Calculate some basic insights
    const insights = {
      metricsRecorded: payload.metrics.length,
      pageLoadTime: payload.metrics.find(m => m.type === 'LCP')?.value || null,
      interactivity: payload.metrics.find(m => m.type === 'FID')?.value || null,
      visualStability: payload.metrics.find(m => m.type === 'CLS')?.value || null,
      serverResponse: payload.metrics.find(m => m.type === 'TTFB')?.value || null,
    };
    
    return NextResponse.json({ 
      success: true,
      insights,
      recordedMetrics: payload.metrics.map(m => ({ type: m.type, value: m.value }))
    });
    
  } catch (error) {
    console.error('Performance tracking error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint for testing and documentation
export async function GET() {
  return NextResponse.json({
    message: 'Analytics performance tracking endpoint is active',
    endpoints: {
      POST: 'Track Core Web Vitals and performance metrics',
    },
    supportedMetrics: {
      LCP: 'Largest Contentful Paint (ms) - measures loading performance',
      FID: 'First Input Delay (ms) - measures interactivity', 
      CLS: 'Cumulative Layout Shift (score) - measures visual stability',
      TTFB: 'Time to First Byte (ms) - measures server response time',
      FCP: 'First Contentful Paint (ms) - measures rendering start',
      INP: 'Interaction to Next Paint (ms) - measures responsiveness'
    },
    example: {
      sessionId: 'session-123',
      pageUrl: '/dashboard',
      metrics: [
        { type: 'LCP', value: 1200 },
        { type: 'FID', value: 50 },
        { type: 'CLS', value: 0.1 },
        { type: 'TTFB', value: 200 }
      ]
    }
  });
}