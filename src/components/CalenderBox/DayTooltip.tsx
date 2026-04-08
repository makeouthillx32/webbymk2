// DayTooltip.tsx - Comprehensive tooltip for calendar day interactions
'use client';

import { format } from 'date-fns';
import { Clock, MapPin, User, DollarSign, Calendar, Home, X } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import QuickActions from './QuickActions';

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

interface DayTooltipProps {
  date: Date;
  events: CalendarEvent[];
  isVisible: boolean;
  onClose: () => void;
  onEventClick: (event: CalendarEvent) => void;
  tooltipType: 'clicked-date' | 'clicked-event';
  userRole: string;
  parentRef?: React.RefObject<HTMLElement>;
  onQuickAction?: (action: string, date: Date) => void;
}

const DayTooltip = ({
  date,
  events,
  isVisible,
  onClose,
  onEventClick,
  tooltipType,
  userRole,
  parentRef,
  onQuickAction
}: DayTooltipProps) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom');
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Smart positioning to prevent overflow
  useEffect(() => {
    if (!isVisible || !tooltipRef.current || !parentRef?.current) return;

    const tooltip = tooltipRef.current;
    const parent = parentRef.current;
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    const parentRect = parent.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let newPosition: 'top' | 'bottom' | 'left' | 'right' = 'bottom';

    // On mobile, prefer full-width bottom position
    if (isMobile) {
      newPosition = 'bottom';
    } else {
      // Check if tooltip fits below
      if (parentRect.bottom + tooltipRect.height + 10 <= viewport.height) {
        newPosition = 'bottom';
      }
      // Check if tooltip fits above
      else if (parentRect.top - tooltipRect.height - 10 >= 0) {
        newPosition = 'top';
      }
      // Check if tooltip fits to the right
      else if (parentRect.right + tooltipRect.width + 10 <= viewport.width) {
        newPosition = 'right';
      }
      // Default to left
      else {
        newPosition = 'left';
      }
    }

    setPosition(newPosition);
  }, [isVisible, isMobile, events.length]);

  if (!isVisible) return null;

  // Group events by type for better organization
  const groupedEvents = {
    special: events.filter(e => ['holiday', 'payday'].includes(e.event_type.toLowerCase())),
    sls: events.filter(e => e.event_type.toLowerCase().includes('sls')),
    hourLogs: events.filter(e => e.is_hour_log),
    regular: events.filter(e => !e.is_hour_log && !['holiday', 'payday'].includes(e.event_type.toLowerCase()) && !e.event_type.toLowerCase().includes('sls'))
  };

  // Calculate stats
  const dayStats = {
    totalEvents: events.length,
    totalHours: groupedEvents.hourLogs.reduce((sum, e) => sum + (e.duration_minutes / 60), 0),
    slsEventCount: groupedEvents.sls.length,
    urgentEvents: events.filter(e => e.priority === 'urgent').length
  };

  // Handle quick actions
  const handleQuickAction = (action: string, data?: any) => {
    // Handle built-in actions
    switch (action) {
      case 'show-toast':
        // You can implement toast notifications here
        console.log('Toast:', data?.message);
        break;
      default:
        // Pass through to parent callback
        if (onQuickAction) {
          onQuickAction(action, date);
        }
    }
  };

  // Get positioning classes
  const getPositionClasses = () => {
    if (isMobile) {
      return {
        container: "fixed inset-x-2 bottom-4 z-[100]", // Higher z-index for mobile
        arrow: "hidden"
      };
    }

    const baseClasses = "absolute z-[100]"; // Higher z-index for desktop too
    const arrowClasses = "absolute w-3 h-3 bg-[hsl(var(--popover))] border";

    switch (position) {
      case 'top':
        return {
          container: `${baseClasses} bottom-full left-1/2 transform -translate-x-1/2 mb-2`,
          arrow: `${arrowClasses} top-full left-1/2 transform -translate-x-1/2 rotate-45 border-t-transparent border-l-transparent`
        };
      case 'bottom':
        return {
          container: `${baseClasses} top-full left-1/2 transform -translate-x-1/2 mt-2`,
          arrow: `${arrowClasses} bottom-full left-1/2 transform -translate-x-1/2 rotate-45 border-b-transparent border-r-transparent`
        };
      case 'left':
        return {
          container: `${baseClasses} right-full top-1/2 transform -translate-y-1/2 mr-2`,
          arrow: `${arrowClasses} left-full top-1/2 transform -translate-y-1/2 rotate-45 border-l-transparent border-b-transparent`
        };
      case 'right':
        return {
          container: `${baseClasses} left-full top-1/2 transform -translate-y-1/2 ml-2`,
          arrow: `${arrowClasses} right-full top-1/2 transform -translate-y-1/2 rotate-45 border-r-transparent border-t-transparent`
        };
      default:
        return {
          container: `${baseClasses} top-full left-1/2 transform -translate-x-1/2 mt-2`,
          arrow: `${arrowClasses} bottom-full left-1/2 transform -translate-x-1/2 rotate-45 border-b-transparent border-r-transparent`
        };
    }
  };

  const positionClasses = getPositionClasses();

  // Render individual event
  const renderEvent = (event: CalendarEvent, showTime: boolean = true) => {
    const getEventIcon = () => {
      switch (event.event_type.toLowerCase()) {
        case 'holiday':
          return <Calendar className="w-4 h-4 text-red-500" />;
        case 'payday':
          return <DollarSign className="w-4 h-4 text-green-500" />;
        case 'sls event':
          return <Home className="w-4 h-4 text-blue-500" />;
        default:
          return <Clock className="w-4 h-4 text-gray-500" />;
      }
    };

    return (
      <div
        key={event.id}
        className="flex items-start space-x-2 p-2 rounded-md hover:bg-[hsl(var(--muted))] cursor-pointer transition-colors"
        onClick={() => onEventClick(event)}
      >
        <div className="flex-shrink-0 mt-0.5">
          {getEventIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-sm text-[hsl(var(--foreground))] truncate">
              {event.title}
            </span>
            {event.priority === 'urgent' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                Urgent
              </span>
            )}
          </div>
          
          {showTime && event.start_time !== 'All Day' && (
            <div className="flex items-center text-xs text-[hsl(var(--muted-foreground))] mt-1">
              <Clock className="w-3 h-3 mr-1" />
              {event.start_time} - {event.end_time}
            </div>
          )}
          
          {event.location && (
            <div className="flex items-center text-xs text-[hsl(var(--muted-foreground))] mt-1">
              <MapPin className="w-3 h-3 mr-1" />
              {event.location}
            </div>
          )}
          
          {(event.client_name || event.coach_name) && (
            <div className="flex items-center text-xs text-[hsl(var(--muted-foreground))] mt-1">
              <User className="w-3 h-3 mr-1" />
              {event.client_name || event.coach_name}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && (
        <div 
          className="fixed inset-0 bg-black/20 z-[99]"
          onClick={onClose}
        />
      )}
      
      <div
        ref={tooltipRef}
        className={`${positionClasses.container} ${
          isMobile ? 'max-w-none w-full' : 'w-80 max-w-sm'
        }`}
      >
        {/* Arrow for desktop */}
        <div className={positionClasses.arrow} />
        
        {/* Main tooltip content */}
        <div className="bg-[hsl(var(--popover))] border border-[hsl(var(--border))] rounded-lg shadow-lg overflow-hidden max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
            <div className="flex-1 min-w-0 pr-2">
              <div className="font-semibold text-[hsl(var(--foreground))] truncate">
                {format(date, 'EEEE, MMMM d')}
              </div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                {dayStats.totalEvents} event{dayStats.totalEvents !== 1 ? 's' : ''}
                {dayStats.totalHours > 0 && ` • ${dayStats.totalHours.toFixed(1)}h logged`}
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="flex-shrink-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-2 rounded transition-colors touch-manipulation"
              aria-label="Close tooltip"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="max-h-80 overflow-y-auto">
            {/* Special Events (Holiday, Payday) */}
            {groupedEvents.special.length > 0 && (
              <div className="p-3 border-b border-[hsl(var(--border))]">
                <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2 uppercase tracking-wide">
                  Special Events
                </div>
                <div className="space-y-1">
                  {groupedEvents.special.map(event => renderEvent(event, false))}
                </div>
              </div>
            )}

            {/* SLS Events */}
            {groupedEvents.sls.length > 0 && (
              <div className="p-3 border-b border-[hsl(var(--border))]">
                <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2 uppercase tracking-wide">
                  SLS Events
                </div>
                <div className="space-y-1">
                  {groupedEvents.sls.map(event => renderEvent(event))}
                </div>
              </div>
            )}

            {/* Regular Events */}
            {groupedEvents.regular.length > 0 && (
              <div className="p-3 border-b border-[hsl(var(--border))]">
                <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2 uppercase tracking-wide">
                  Scheduled Events
                </div>
                <div className="space-y-1">
                  {groupedEvents.regular.map(event => renderEvent(event))}
                </div>
              </div>
            )}

            {/* Hour Logs */}
            {groupedEvents.hourLogs.length > 0 && (
              <div className="p-3 border-b border-[hsl(var(--border))]">
                <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2 uppercase tracking-wide">
                  Time Logs
                </div>
                <div className="space-y-1">
                  {groupedEvents.hourLogs.map(event => renderEvent(event, false))}
                </div>
              </div>
            )}

            {/* Quick Actions using the QuickActions component */}
            {tooltipType === 'clicked-date' && (
              <QuickActions
                date={date}
                events={events}
                userRole={userRole}
                context="date"
                onAction={handleQuickAction}
                compact={isMobile}
              />
            )}

            {/* Quick Actions for clicked events */}
            {tooltipType === 'clicked-event' && groupedEvents.hourLogs.length > 0 && (
              <QuickActions
                date={date}
                events={events}
                userRole={userRole}
                context="event"
                selectedEvent={groupedEvents.hourLogs[0]}
                onAction={handleQuickAction}
                compact={isMobile}
              />
            )}

            {/* Empty state */}
            {events.length === 0 && (
              <div className="p-6 text-center text-[hsl(var(--muted-foreground))]">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No events scheduled</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default DayTooltip;