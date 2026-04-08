// components/CalenderBox/CalendarEvent.tsx - Uses database event types only
'use client';

import { useState, useEffect } from 'react';

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

interface CalendarEventProps {
  event: CalendarEvent;
  index: number;
  maxVisible: number;
  onClick: (event: CalendarEvent) => void;
  formatTime: (timeString: string, isHourLog?: boolean) => string;
}

interface EventType {
  id: string;
  name: string;
  description: string;
  color_code: string;
  is_active: boolean;
}

const CalendarEvent = ({
  event,
  index,
  maxVisible,
  onClick,
  formatTime
}: CalendarEventProps) => {
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch event types from database
  useEffect(() => {
    const fetchEventTypes = async () => {
      try {
        const response = await fetch('/api/calendar/event-types', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const types = await response.json();
          setEventTypes(types);
        } else {
          console.warn('Failed to load event types');
        }
      } catch (error) {
        console.error('Error loading event types:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEventTypes();
  }, []);

  if (index >= maxVisible || loading) {
    return null;
  }

  // Find the event type from database
  const eventTypeData = eventTypes.find(type => 
    type.name.toLowerCase() === event.event_type.toLowerCase()
  );

  // Get database color or fallback to event.color_code
  const backgroundColor = eventTypeData?.color_code || event.color_code || '#3B82F6';

  // Get event display text based on database event type
  const getEventDisplayText = () => {
    if (event.is_hour_log) {
      return event.title; // e.g., "TB 7h"
    }

    // Check event type from database
    const eventTypeName = eventTypeData?.name || event.event_type;
    
    switch (eventTypeName.toLowerCase()) {
      case 'payday':
        return `💰 ${event.title}`;
      case 'holiday':
        return `🎉 ${event.title}`;
      case 'sls event':
        const displayTitle = event.title.replace(/^SLS:\s*/i, '');
        return `🏠 ${displayTitle}`;
      case 'meeting':
        const timeText = formatTime(event.start_time, false);
        return timeText ? `${timeText} ${event.title}` : event.title;
      case 'appointment':
        const appointmentTime = formatTime(event.start_time, false);
        return appointmentTime ? `${appointmentTime} ${event.title}` : event.title;
      default:
        // For all other event types, show time + title
        const defaultTime = formatTime(event.start_time, false);
        return defaultTime ? `${defaultTime} ${event.title}` : event.title;
    }
  };

  // Get tooltip text based on database event type
  const getTooltipText = () => {
    if (event.is_hour_log) {
      return event.description || event.title;
    }

    const eventTypeName = eventTypeData?.name || event.event_type;
    const startTime = formatTime(event.start_time, false);
    const endTime = formatTime(event.end_time, false);
    
    let tooltip = event.title;
    
    if (startTime && endTime) {
      tooltip += ` - ${startTime} to ${endTime}`;
    }
    
    if (event.client_name) {
      tooltip += ` (Client: ${event.client_name})`;
    }

    if (eventTypeData?.description) {
      tooltip += ` - ${eventTypeData.description}`;
    }
    
    return tooltip;
  };

  // Get styling based ONLY on database event type and priority
  const getEventStyling = () => {
    const baseStyle = { 
      backgroundColor: backgroundColor
    };
    
    // Only add priority-based borders, no hardcoded event type styling
    if (event.priority === 'urgent') {
      return {
        ...baseStyle,
        borderLeft: '3px solid #dc2626',
        animation: 'pulse 2s infinite'
      };
    }
    
    if (event.priority === 'high') {
      return {
        ...baseStyle,
        borderLeft: '3px solid #f59e0b'
      };
    }

    // Special handling for hour logs
    if (event.is_hour_log) {
      return {
        ...baseStyle,
        borderLeft: '3px solid #059669'
      };
    }
    
    return baseStyle;
  };

  // Get CSS classes based on database event type
  const getEventClasses = () => {
    let classes = "mb-1 cursor-pointer rounded-sm px-1 py-0.5 text-xs font-medium text-white truncate transition-all duration-200 hover:scale-105 hover:shadow-md";
    
    if (event.priority === 'urgent') {
      classes += ' animate-pulse';
    }
    
    const eventTypeName = eventTypeData?.name || event.event_type;
    
    // Add special styling based on database event type
    switch (eventTypeName.toLowerCase()) {
      case 'payday':
      case 'holiday':
        classes += ' font-bold shadow-sm';
        break;
      case 'sls event':
        classes += ' font-semibold shadow-sm ring-1 ring-opacity-20';
        break;
      default:
        // Default styling for all other database event types
        break;
    }
    
    return classes;
  };

  return (
    <div
      className={getEventClasses()}
      style={getEventStyling()}
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
      title={getTooltipText()}
    >
      <span className="block truncate">
        {getEventDisplayText()}
      </span>
      
      {/* Priority indicator for urgent events */}
      {event.priority === 'urgent' && (
        <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
      )}

      {/* Event type indicator */}
      {eventTypeData && (
        <div 
          className="absolute top-0 left-0 w-1 h-full rounded-l-sm opacity-70"
          style={{ backgroundColor: eventTypeData.color_code }}
        />
      )}
    </div>
  );
};

export default CalendarEvent;