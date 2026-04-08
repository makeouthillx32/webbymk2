// app/dashboard/[id]/calendar/_hooks/useEventHandlers.ts
'use client';

import { useCallback } from 'react';
import { CalendarEvent } from './useOptimisticHours';

interface CoachHoursData {
  report_date: string;
  hours_worked: number;
  location?: string;
  activity_type?: string;
  notes?: string;
}

interface OptimisticUpdate {
  id: string;
  date: string;
  hours: number;
  activity: string;
  location: string;
  notes: string;
  coachName: string;
  timestamp: number;
}

interface UseEventHandlersProps {
  permissions: {
    canLogHours: boolean;
    canCreateEvents: boolean;
    canEditEvents: boolean;
    canDeleteEvents: boolean;
  };
  userRole: string;
  selectedEvent: CalendarEvent | null;
  createEvent: (eventData: any) => Promise<void>;
  updateEvent: (eventId: string, eventData: any) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  logHours?: (hoursData: CoachHoursData) => Promise<void>;
  addOptimisticEntry: (entry: OptimisticUpdate) => void;
  removeOptimisticEntry: (entryId: string) => void;
  setIsEventModalOpen: (open: boolean) => void;
  setIsHoursModalOpen: (open: boolean) => void;
  setSelectedDate: (date: Date | null) => void;
  setSelectedEvent: (event: CalendarEvent | null) => void;
}

export function useEventHandlers({
  permissions,
  userRole,
  selectedEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  logHours,
  addOptimisticEntry,
  removeOptimisticEntry,
  setIsEventModalOpen,
  setIsHoursModalOpen,
  setSelectedDate,
  setSelectedEvent
}: UseEventHandlersProps) {

  // Handle date click
  const handleDateClick = useCallback((date: Date) => {
    if (permissions.canLogHours && userRole === 'coachx7') {
      // For coaches, clicking a date opens hours modal
      setSelectedDate(date);
      setIsHoursModalOpen(true);
      return;
    }
    
    if (permissions.canCreateEvents) {
      // For admins, clicking a date opens event modal
      setSelectedDate(date);
      setSelectedEvent(null);
      setIsEventModalOpen(true);
      return;
    }
    
    console.log('User does not have permission to create events or log hours');
  }, [permissions, userRole, setSelectedDate, setIsHoursModalOpen, setSelectedEvent, setIsEventModalOpen]);

  // Handle event click
  const handleEventClick = useCallback((event: CalendarEvent) => {
    // Handle hour log event clicks differently
    if (event.is_hour_log) {
      // For hour logs, open the hours modal for that date to view/edit
      setSelectedDate(new Date(event.event_date));
      setIsHoursModalOpen(true);
      return;
    }

    // Regular event handling
    setSelectedEvent(event);
    setSelectedDate(new Date(event.event_date));
    setIsEventModalOpen(true);
  }, [setSelectedDate, setIsHoursModalOpen, setSelectedEvent, setIsEventModalOpen]);

  // Handle create event
  const handleCreateEvent = useCallback(async (eventData: any) => {
    if (!permissions.canCreateEvents) {
      console.error('User does not have permission to create events');
      return;
    }

    try {
      await createEvent(eventData);
      setIsEventModalOpen(false);
      setSelectedEvent(null);
      setSelectedDate(null);
    } catch (error) {
      console.error('Failed to create event:', error);
    }
  }, [permissions, createEvent, setIsEventModalOpen, setSelectedEvent, setSelectedDate]);

  // Handle update event
  const handleUpdateEvent = useCallback(async (eventData: any) => {
    if (!selectedEvent || !permissions.canEditEvents) {
      console.error('User does not have permission to edit events');
      return;
    }
    
    try {
      await updateEvent(selectedEvent.id, eventData);
      setIsEventModalOpen(false);
      setSelectedEvent(null);
      setSelectedDate(null);
    } catch (error) {
      console.error('Failed to update event:', error);
    }
  }, [selectedEvent, permissions, updateEvent, setIsEventModalOpen, setSelectedEvent, setSelectedDate]);

  // Handle delete event
  const handleDeleteEvent = useCallback(async () => {
    if (!selectedEvent || !permissions.canDeleteEvents) {
      console.error('User does not have permission to delete events');
      return;
    }
    
    try {
      await deleteEvent(selectedEvent.id);
      setIsEventModalOpen(false);
      setSelectedEvent(null);
      setSelectedDate(null);
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  }, [selectedEvent, permissions, deleteEvent, setIsEventModalOpen, setSelectedEvent, setSelectedDate]);

  // Enhanced hours submission with optimistic updates
  const handleHoursSubmit = useCallback(async (hoursData: CoachHoursData, optimisticData: OptimisticUpdate) => {
    if (!permissions.canLogHours) {
      console.error('User does not have permission to log hours');
      return;
    }

    try {
      // Add optimistic entry to state immediately
      addOptimisticEntry(optimisticData);

      // Close modal immediately for better UX
      setIsHoursModalOpen(false);
      setSelectedDate(null);

      // Save to database in background
      if (logHours) {
        await logHours(hoursData);
        // On successful save, the optimistic entry will be replaced by real data on next reload
      } else {
        // Temporary mock implementation
        await new Promise(resolve => setTimeout(resolve, 1000));        
      }
      
    } catch (error) {
      // On error, remove the optimistic entry
      removeOptimisticEntry(optimisticData.id);
      
      // Reopen modal to show error
      setIsHoursModalOpen(true);
      console.error('Failed to log hours:', error);
      throw error; // Let modal handle the error display
    }
  }, [permissions, logHours, addOptimisticEntry, removeOptimisticEntry, setIsHoursModalOpen, setSelectedDate]);

  return {
    handleDateClick,
    handleEventClick,
    handleCreateEvent,
    handleUpdateEvent,
    handleDeleteEvent,
    handleHoursSubmit
  };
}