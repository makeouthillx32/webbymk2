// hooks/calendar-fetchers.ts
// Network functions and data fetching logic - no hooks, safe to call inside useCalendarEvents

import { toast } from 'react-hot-toast';
import { formatDate } from './calendar-utils';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  event_date: string;
  start_time: string;
  end_time: string;
  event_type: string;
  client_name?: string;
  coach_name?: string;
  color_code: string;
  status: string;
  location?: string;
  is_virtual: boolean;
  virtual_meeting_link?: string;
  duration_minutes: number;
  is_hour_log?: boolean;
}

export interface HourLogData {
  report_date: string;
  hours_worked: number;
  work_location_id?: string;
  location?: string;
  activity_type?: string;
  notes?: string;
  initials?: string;
}

/**
 * Fetch calendar events from calendar_events table
 */
export const fetchCalendarEvents = async (
  userId: string,
  userRole: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> => {
  if (!userId) return [];
  
  try {
    console.log('[Calendar] Fetching calendar events for:', userRole, userId);
    
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);
    
    // Build API URL for calendar events (NOT hour logs)
    const apiUrl = `/api/calendar/events?start_date=${startDateStr}&end_date=${endDateStr}&user_id=${userId}&user_role=${userRole}`;
    
    const response = await fetch(apiUrl, {
      credentials: 'include'
    });

    if (!response.ok) {
      console.warn('[Calendar] Could not fetch calendar events:', response.status);
      return [];
    }

    const calendarEvents = await response.json();
    console.log('[Calendar] Found calendar events:', calendarEvents.length, 'entries');

    return calendarEvents;
    
  } catch (error) {
    console.error('[Calendar] Error fetching calendar events:', error);
    return [];
  }
};

/**
 * Fetch logged hours for coaches AND admins
 */
export const fetchLoggedHours = async (
  userId: string,
  userRole: string,
  startDate: Date,
  endDate: Date,
  coachName?: string
): Promise<CalendarEvent[]> => {
  // Fetch hour logs for both coaches and admins
  if (!userId || (userRole !== 'coachx7' && userRole !== 'admin1')) {
    return [];
  }

  try {
    console.log('[Calendar] Fetching logged hours for role:', userRole, 'userId:', userId);
    
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);
    
    // For coaches, get only their own hour logs
    // For admins, get all hour logs (no coach_id filter)
    let apiUrl = `/api/calendar/logged-hours-range?start_date=${startDateStr}&end_date=${endDateStr}`;
    
    if (userRole === 'coachx7') {
      // Coaches see only their own hour logs
      apiUrl += `&coach_id=${userId}`;
    }
    // Admins see ALL hour logs (no coach_id filter)
    
    const response = await fetch(apiUrl, {
      credentials: 'include'
    });

    if (!response.ok) {
      console.warn('[Calendar] Could not fetch logged hours:', response.status);
      return [];
    }

    const loggedHours = await response.json();
    console.log('[Calendar] Found logged hours:', loggedHours.length, 'entries');

    // Convert logged hours to calendar events
    const hourEvents: CalendarEvent[] = loggedHours.map((hour: any) => {
      // Get location name (either from work_locations join or custom location)
      const locationName = hour.work_locations?.location_name || hour.location || 'Unknown location';
      const locationDetails = hour.work_locations?.city ? 
        `${locationName}, ${hour.work_locations.city}` : locationName;
      
      // Get coach name from the hour log data or fallback
      const hourCoachName = hour.coach_name || hour.profiles?.display_name || coachName || 'Unknown Coach';
      
      return {
        id: `hour-log-${hour.id}`,
        title: `${hour.initials || 'Coach'} ${hour.hours_worked || 0}h`, // Ensure no NaN and add 'h' for hours
        description: `${hour.hours_worked || 0} hours - ${hour.activity_type || 'Work'} at ${locationDetails}${hour.notes ? '\n\nNotes: ' + hour.notes : ''}`,
        event_date: hour.report_date,
        start_time: 'All Day', // Special indicator for hour logs
        end_time: 'All Day', // Special indicator for hour logs
        event_type: 'Hour Log',
        coach_name: hourCoachName,
        client_name: '',
        color_code: '#10B981', // Green for hour logs
        status: 'completed',
        location: locationDetails,
        is_virtual: false,
        virtual_meeting_link: '',
        duration_minutes: (hour.hours_worked || 0) * 60,
        is_hour_log: true
      };
    });

    return hourEvents;
  } catch (error) {
    console.error('[Calendar] Error fetching logged hours:', error);
    return [];
  }
};

/**
 * Log hours for coaches
 */
export const logHours = async (
  hourData: HourLogData,
  userId: string,
  userRole: string,
  coachName?: string
): Promise<any> => {
  // Only coaches can log hours
  if (userRole !== 'coachx7') {
    throw new Error('Only coaches can log hours');
  }

  try {
    console.log('[Calendar] Logging hours:', hourData);

    // Call API to save to coach_daily_reports table
    const response = await fetch('/api/calendar/log-hours', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        ...hourData,
        coach_id: userId,
        coach_name: coachName,
        initials: hourData.initials || 'Coach' // Extract initials from hourData
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Calendar] API Error:', response.status, errorText);
      throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();
    console.log('[Calendar] ✅ Hours logged successfully:', result);

    toast.success(`Successfully logged ${hourData.hours_worked} hours for ${hourData.activity_type}`);
    
    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to log hours';
    console.error('[Calendar] Hour logging error:', err);
    toast.error(errorMessage);
    throw err;
  }
};

/**
 * Get logged hours for a specific date (only for coaches)
 */
export const getLoggedHoursForDate = async (
  date: Date,
  userId: string,
  userRole: string
): Promise<number> => {
  if (userRole !== 'coachx7' || !userId) return 0;

  try {
    const dateStr = formatDate(date);
    // FIXED: Use the correct API endpoint that exists
    const response = await fetch(`/api/calendar/log-hours?date=${dateStr}&coach_id=${userId}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      console.warn('[Calendar] Could not fetch hours for date:', response.status);
      return 0;
    }

    const result = await response.json();
    return result.totalHours || 0;
  } catch (error) {
    console.error('[Calendar] Error fetching hours for date:', error);
    return 0;
  }
};