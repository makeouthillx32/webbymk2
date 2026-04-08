// Fixed CalendarBox - Original layout with separated tooltips
'use client';

import { useState, useEffect, useRef } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, isSameDay } from 'date-fns';
import CalendarEvent from './CalendarEvent';
import DayTooltip from './DayTooltip';
import EventHoverTooltip from './EventHoverTooltip';

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

interface CalendarBoxProps {
  currentDate: Date;
  events: CalendarEvent[];
  userRole: string;
  loading?: boolean;
  // Callback functions from page
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
  onLogHours: (date?: Date) => void;
  onCreateEvent: (date?: Date) => void;
  // Context menu callbacks
  onDateRightClick?: (e: React.MouseEvent, date: Date, events: CalendarEvent[]) => void;
  onEventRightClick?: (e: React.MouseEvent, event: CalendarEvent) => void;
}

const CalendarBox = ({
  currentDate,
  events = [],
  userRole,
  loading = false,
  onEventClick,
  onDateClick,
  onLogHours,
  onCreateEvent,
  onDateRightClick,
  onEventRightClick
}: CalendarBoxProps) => {
  // Day tooltip state (replaces old EventTooltip for clicked dates)
  const [clickedDate, setClickedDate] = useState<Date | null>(null);
  const [dayTooltipType, setDayTooltipType] = useState<'clicked-date' | 'clicked-event'>('clicked-date');
  
  // Event hover tooltip state (new - for hovering over events)
  const [hoveredEvent, setHoveredEvent] = useState<CalendarEvent | null>(null);
  const [eventTooltipPosition, setEventTooltipPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  const calendarRef = useRef<HTMLDivElement>(null);

  // Calculate calendar days
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    const dateString = format(date, 'yyyy-MM-dd');
    return events.filter(event => event.event_date === dateString);
  };

  // Format time for display
  const formatTime = (timeString: string, isHourLog?: boolean) => {
    if (isHourLog || timeString === 'All Day') return '';
    
    try {
      const [hours, minutes] = timeString.split(':').map(Number);
      const hour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      return `${hour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    } catch (error) {
      return '';
    }
  };

  // Original working cell styling
  const getCellClass = (date: Date) => {
    const baseClass = "ease relative h-20 cursor-pointer border border-[hsl(var(--border))] p-2 transition duration-500 hover:bg-[hsl(var(--muted))] dark:border-[hsl(var(--sidebar-border))] dark:hover:bg-[hsl(var(--secondary))] md:h-25 md:p-6 xl:h-31";
    
    if (!isSameMonth(date, currentDate)) {
      return baseClass + " opacity-50";
    }
    
    if (isToday(date)) {
      return baseClass + " bg-[hsl(var(--accent))] ring-2 ring-[hsl(var(--primary))]";
    }
    
    return baseClass;
  };

  // Original working day number styling
  const getDayNumberClass = (date: Date) => {
    let baseClass = "font-medium";
    
    if (isToday(date)) {
      baseClass += " text-[hsl(var(--primary))] font-bold";
    } else if (!isSameMonth(date, currentDate)) {
      baseClass += " text-[hsl(var(--muted-foreground))]";
    } else {
      baseClass += " text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]";
    }
    
    return baseClass;
  };

  // Handle event click - for opening modals or showing day tooltip
  const handleEventClick = (event: CalendarEvent) => {
    // Clear event hover tooltip
    setHoveredEvent(null);
    
    if (event.is_hour_log) {
      // For hour logs, show day tooltip in clicked-event mode
      const eventDate = new Date(event.event_date);
      setClickedDate(clickedDate && isSameDay(clickedDate, eventDate) ? null : eventDate);
      setDayTooltipType('clicked-event');
    } else {
      // For regular events, use page callback (opens modal)
      onEventClick(event);
    }
  };

  // Handle date click - for showing day tooltip
  const handleDateClick = (date: Date) => {
    // Clear event hover tooltip
    setHoveredEvent(null);
    
    // Toggle day tooltip
    setClickedDate(clickedDate && isSameDay(clickedDate, date) ? null : date);
    setDayTooltipType('clicked-date');
    
    // Also call page callback
    onDateClick(date);
  };

  // Handle event hover - show event hover tooltip
  const handleEventHover = (event: CalendarEvent, mouseEvent: React.MouseEvent) => {
    // Don't show hover tooltip if day tooltip is open
    if (clickedDate) return;
    
    setHoveredEvent(event);
    setEventTooltipPosition({
      x: mouseEvent.clientX,
      y: mouseEvent.clientY
    });
  };

  // Handle event hover end
  const handleEventHoverEnd = () => {
    setHoveredEvent(null);
  };

  // Handle right-click on date
  const handleDateRightClick = (e: React.MouseEvent, date: Date) => {
    e.preventDefault();
    const dayEvents = getEventsForDate(date);
    
    if (onDateRightClick) {
      onDateRightClick(e, date, dayEvents);
    }
  };

  // Handle right-click on event
  const handleEventRightClick = (e: React.MouseEvent, event: CalendarEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (onEventRightClick) {
      onEventRightClick(e, event);
    }
  };

  // Handle day tooltip close
  const handleDayTooltipClose = () => {
    setClickedDate(null);
  };

  // Handle quick actions from day tooltip
  const handleQuickAction = (action: string, date: Date) => {
    switch (action) {
      case 'log-hours':
        onLogHours(date);
        break;
      case 'create-event':
        onCreateEvent(date);
        break;
      default:
        break;
    }
    handleDayTooltipClose();
  };

  // Render calendar grid
  const renderCalendarGrid = () => {
    const weeks = [];
    
    for (let i = 0; i < calendarDays.length; i += 7) {
      const week = calendarDays.slice(i, i + 7);
      weeks.push(week);
    }

    return weeks.map((week, weekIndex) => (
      <tr key={weekIndex} className="grid grid-cols-7">
        {week.map((date, dayIndex) => {
          const dayEvents = getEventsForDate(date);
          const isFirstDay = weekIndex === 0 && dayIndex === 0;
          const isLastDay = weekIndex === weeks.length - 1 && dayIndex === 6;
          
          let cellClass = getCellClass(date);
          if (isFirstDay) cellClass += " rounded-bl-[var(--radius)]";
          if (isLastDay) cellClass += " rounded-br-[var(--radius)]";

          const maxVisibleEvents = 3;

          return (
            <td
              key={date.toISOString()}
              className={`${cellClass} calendar-day`}
              onClick={() => handleDateClick(date)}
              onContextMenu={(e) => handleDateRightClick(e, date)}
            >
              <span className={getDayNumberClass(date)}>
                {format(date, 'd')}
              </span>
              
              <div className="mt-1 space-y-1 overflow-hidden">
                {dayEvents.slice(0, maxVisibleEvents).map((event, index) => (
                  <div
                    key={event.id}
                    className="calendar-event"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEventClick(event);
                    }}
                    onContextMenu={(e) => handleEventRightClick(e, event)}
                    onMouseEnter={(e) => handleEventHover(event, e)}
                    onMouseLeave={handleEventHoverEnd}
                  >
                    <CalendarEvent
                      event={event}
                      index={index}
                      maxVisible={maxVisibleEvents}
                      onClick={() => {}} // Empty since we handle it in parent div
                      formatTime={formatTime}
                    />
                  </div>
                ))}
                
                {dayEvents.length > maxVisibleEvents && (
                  <div 
                    className="text-xs text-[hsl(var(--muted-foreground))] cursor-pointer hover:text-[hsl(var(--primary))]"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDateClick(date);
                    }}
                  >
                    +{dayEvents.length - maxVisibleEvents} more
                  </div>
                )}
              </div>
            </td>
          );
        })}
      </tr>
    ));
  };

  if (loading) {
    return (
      <div className="w-full max-w-full rounded-[var(--radius)] bg-[hsl(var(--background))] shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)]">
        <div className="animate-pulse">
          <div className="h-15 bg-[hsl(var(--muted))] rounded-t-[var(--radius)]"></div>
          <div className="grid grid-cols-7 gap-1 p-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-20 bg-[hsl(var(--muted))] rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={calendarRef}
      className="w-full max-w-full rounded-[var(--radius)] bg-[hsl(var(--background))] shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)]"
    >
      <table className="w-full">
        <thead>
          <tr className="grid grid-cols-7 rounded-t-[var(--radius)] bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]">
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
              <th
                key={day}
                className={`flex h-15 items-center justify-center p-1 text-body-xs font-medium sm:text-base xl:p-5 ${
                  index === 0 ? 'rounded-tl-[var(--radius)]' : ''
                } ${index === 6 ? 'rounded-tr-[var(--radius)]' : ''}`}
              >
                <span className="hidden lg:block">{day}</span>
                <span className="block lg:hidden">{day.slice(0, 3)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {renderCalendarGrid()}
        </tbody>
      </table>

      {/* DayTooltip - for clicked dates (uses QuickActions component) */}
      {clickedDate && (
        <DayTooltip
          date={clickedDate}
          events={getEventsForDate(clickedDate)}
          isVisible={true}
          onClose={handleDayTooltipClose}
          onEventClick={handleEventClick}
          tooltipType={dayTooltipType}
          userRole={userRole}
          parentRef={calendarRef}
          onQuickAction={handleQuickAction}
        />
      )}

      {/* EventHoverTooltip - for hovering over individual events */}
      {hoveredEvent && (
        <EventHoverTooltip
          event={hoveredEvent}
          isVisible={true}
          position={eventTooltipPosition}
          formatTime={formatTime}
        />
      )}
    </div>
  );
};

export default CalendarBox;