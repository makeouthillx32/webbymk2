// hooks/useCalendarModals.ts - Extract modal management logic
import { useState } from 'react';

interface CalendarEvent {
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
  is_payday?: boolean;
  is_holiday?: boolean;
  is_sales_day?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  location?: string;
  amount?: number;
  duration_minutes: number;
}

interface CoachHoursData {
  report_date: string;
  hours_worked: number;
  work_location_id?: string;
  location?: string;
  activity_type?: string;
  notes?: string;
  initials?: string;
}

interface CalendarEventActions {
  createEvent: (eventData: any) => Promise<void>;
  updateEvent: (id: string, eventData: any) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  logHours: (hoursData: CoachHoursData) => Promise<void>;
}

interface CalendarPermissions {
  canCreateEvents: boolean;
  canEditEvents: boolean;
  canDeleteEvents: boolean;
  canLogHours: boolean;
  canExportData: boolean;
}

export function useCalendarModals(eventActions: CalendarEventActions, permissions: CalendarPermissions) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const handleLogHours = (date?: Date) => {
    setSelectedDate(date || new Date());
    setIsHoursModalOpen(true);
  };

  const handleCreateEvent = (date?: Date) => {
    setSelectedDate(date || new Date());
    setSelectedEvent(null);
    setIsEventModalOpen(true);
  };

  const handleCreateEventSubmit = async (eventData: any) => {
    if (!permissions.canCreateEvents) return;
    try {
      await eventActions.createEvent(eventData);
      setIsEventModalOpen(false);
      setSelectedEvent(null);
      setSelectedDate(null);
    } catch (error) {
      console.error('Failed to create event:', error);
    }
  };

  const handleUpdateEventSubmit = async (eventData: any) => {
    if (!selectedEvent || !permissions.canEditEvents) return;
    try {
      await eventActions.updateEvent(selectedEvent.id, eventData);
      setIsEventModalOpen(false);
      setSelectedEvent(null);
      setSelectedDate(null);
    } catch (error) {
      console.error('Failed to update event:', error);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent || !permissions.canDeleteEvents) return;
    try {
      await eventActions.deleteEvent(selectedEvent.id);
      setIsEventModalOpen(false);
      setSelectedEvent(null);
      setSelectedDate(null);
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  };

  const handleHoursSubmit = async (hoursData: CoachHoursData) => {
    if (!permissions.canLogHours) return;
    try {
      console.log('🏗️ Calendar page submitting hours:', hoursData);
      await eventActions.logHours(hoursData);
      setIsHoursModalOpen(false);
      setSelectedDate(null);
    } catch (error) {
      console.error('Failed to log hours:', error);
      throw error;
    }
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setSelectedDate(new Date(event.event_date));
    setIsEventModalOpen(true);
  };

  const handleCloseEventModal = () => {
    setIsEventModalOpen(false);
    setSelectedEvent(null);
    setSelectedDate(null);
  };

  const handleCloseHoursModal = () => {
    setIsHoursModalOpen(false);
    setSelectedDate(null);
  };

  return {
    selectedDate,
    isEventModalOpen,
    isHoursModalOpen,
    selectedEvent,
    handleLogHours,
    handleCreateEvent,
    handleCreateEventSubmit,
    handleUpdateEventSubmit,
    handleDeleteEvent,
    handleHoursSubmit,
    handleEditEvent,
    handleCloseEventModal,
    handleCloseHoursModal
  };
}