// app/dashboard/[id]/calendar/_hooks/useOptimisticHours.ts
'use client';

import { useState, useCallback, useEffect } from 'react';

// Optimistic hour log entry
export interface OptimisticHourLog {
  id: string;
  date: string;
  hours: number;
  activity: string;
  location: string;
  notes: string;
  coachName: string;
  timestamp: number;
}

// Calendar event interface
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
  is_hour_log?: boolean;
}

interface UseOptimisticHoursProps {
  userRole: string;
  user: any;
  hasLoaded: boolean;
  events: CalendarEvent[];
}

export function useOptimisticHours({ 
  userRole, 
  user, 
  hasLoaded, 
  events 
}: UseOptimisticHoursProps) {
  const [optimisticHours, setOptimisticHours] = useState<OptimisticHourLog[]>([]);

  // Convert optimistic hour logs to calendar events for display
  const convertHourLogsToEvents = useCallback((hourLogs: OptimisticHourLog[]): CalendarEvent[] => {
    return hourLogs.map(log => ({
      id: `hour-log-${log.id}`,
      title: `${log.hours}h - ${log.activity}`,
      description: log.notes || `Logged ${log.hours} hours at ${log.location}`,
      event_date: log.date,
      start_time: '09:00',
      end_time: '17:00',
      event_type: 'Hour Log',
      coach_name: log.coachName,
      client_name: '',
      color_code: '#10B981', // Green for hour logs
      status: 'completed',
      is_hour_log: true
    }));
  }, []);

  // Add optimistic entry
  const addOptimisticEntry = useCallback((entry: OptimisticHourLog) => {
    setOptimisticHours(prev => {
      // Remove any existing entry for this date, then add new one
      const filtered = prev.filter(existing => existing.date !== entry.date);
      return [...filtered, entry];
    });
  }, []);

  // Remove optimistic entry (on error)
  const removeOptimisticEntry = useCallback((entryId: string) => {
    setOptimisticHours(prev => 
      prev.filter(entry => entry.id !== entryId)
    );
  }, []);

  // Clear all optimistic entries
  const clearOptimisticEntries = useCallback(() => {
    setOptimisticHours([]);
  }, []);

  // Clear optimistic entries when real data loads (on reload/refresh)
  useEffect(() => {
    if (hasLoaded && events && events.length > 0) {
      // Clear optimistic entries that now exist in the database
      setOptimisticHours(prev => {
        return prev.filter(optimistic => {
          // Check if this date already has a real hour log event
          const realEvent = events.find(event => 
            event.event_date === optimistic.date && 
            event.title.includes(`${optimistic.hours}h`) &&
            event.is_hour_log
          );
          return !realEvent; // Keep only if no real event found
        });
      });
    }
  }, [hasLoaded, events]);

  // Get optimistic events for calendar display
  const getOptimisticEvents = useCallback((): CalendarEvent[] => {
    // Only show optimistic hour logs for coaches
    if (userRole === 'coachx7' && optimisticHours.length > 0) {
      return convertHourLogsToEvents(optimisticHours);
    }
    return [];
  }, [userRole, optimisticHours, convertHourLogsToEvents]);

  return {
    optimisticHours,
    optimisticCount: optimisticHours.length,
    addOptimisticEntry,
    removeOptimisticEntry,
    clearOptimisticEntries,
    getOptimisticEvents
  };
}