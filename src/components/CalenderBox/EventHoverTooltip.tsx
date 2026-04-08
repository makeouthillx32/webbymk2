// EventHoverTooltip.tsx - Small tooltip for hovering over individual events
'use client';

import { Clock, MapPin, User, AlertCircle } from 'lucide-react';

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
  duration_minutes: number;
  is_hour_log?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  location?: string;
  amount?: number;
}

interface EventHoverTooltipProps {
  event: CalendarEvent;
  isVisible: boolean;
  position: { x: number; y: number };
  formatTime: (timeString: string, isHourLog?: boolean) => string;
}

const EventHoverTooltip = ({
  event,
  isVisible,
  position,
  formatTime
}: EventHoverTooltipProps) => {
  if (!isVisible) return null;

  const getEventTypeDisplay = () => {
    switch (event.event_type.toLowerCase()) {
      case 'holiday':
        return '🎉 Holiday';
      case 'payday':
        return '💰 Payday';
      case 'sls event':
        return '🏠 SLS Event';
      case 'meeting':
        return '👥 Meeting';
      case 'appointment':
        return '📅 Appointment';
      default:
        return event.event_type;
    }
  };

  const getTimeDisplay = () => {
    if (event.is_hour_log) {
      const hours = event.duration_minutes / 60;
      return `${hours.toFixed(1)} hours logged`;
    }
    
    if (event.start_time === 'All Day') {
      return 'All Day';
    }
    
    const startTime = formatTime(event.start_time);
    const endTime = formatTime(event.end_time);
    
    if (startTime && endTime) {
      return `${startTime} - ${endTime}`;
    }
    
    return '';
  };

  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={{
        left: position.x + 10,
        top: position.y - 10,
        transform: 'translateY(-100%)'
      }}
    >
      <div className="bg-[hsl(var(--popover))] border border-[hsl(var(--border))] rounded-md shadow-lg p-3 max-w-xs">
        {/* Event Title */}
        <div className="font-semibold text-sm text-[hsl(var(--foreground))] mb-1">
          {event.title}
        </div>

        {/* Event Type */}
        <div className="text-xs text-[hsl(var(--muted-foreground))] mb-2">
          {getEventTypeDisplay()}
        </div>

        {/* Time Information */}
        {getTimeDisplay() && (
          <div className="flex items-center text-xs text-[hsl(var(--muted-foreground))] mb-1">
            <Clock className="w-3 h-3 mr-1" />
            {getTimeDisplay()}
          </div>
        )}

        {/* Location */}
        {event.location && (
          <div className="flex items-center text-xs text-[hsl(var(--muted-foreground))] mb-1">
            <MapPin className="w-3 h-3 mr-1" />
            {event.location}
          </div>
        )}

        {/* Client/Coach */}
        {(event.client_name || event.coach_name) && (
          <div className="flex items-center text-xs text-[hsl(var(--muted-foreground))] mb-1">
            <User className="w-3 h-3 mr-1" />
            {event.client_name || event.coach_name}
          </div>
        )}

        {/* Priority indicator */}
        {event.priority === 'urgent' && (
          <div className="flex items-center text-xs text-red-600 mt-2">
            <AlertCircle className="w-3 h-3 mr-1" />
            Urgent Priority
          </div>
        )}

        {/* Description */}
        {event.description && (
          <div className="text-xs text-[hsl(var(--muted-foreground))] mt-2 border-t border-[hsl(var(--border))] pt-2">
            {event.description}
          </div>
        )}

        {/* Amount for paydays */}
        {event.amount && event.event_type.toLowerCase() === 'payday' && (
          <div className="text-xs font-medium text-green-600 mt-1">
            ${event.amount.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
};

export default EventHoverTooltip;