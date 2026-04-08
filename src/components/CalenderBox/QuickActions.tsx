// QuickActions.tsx - Reusable quick actions component
'use client';

import { 
  Clock, 
  Calendar, 
  Home, 
  Copy, 
  Share2, 
  Edit, 
  Trash2, 
  Plus,
  FileText,
  Bell,
  Star,
  Download,
  Mail,
  Phone
} from 'lucide-react';

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

interface QuickActionsProps {
  date: Date;
  events: CalendarEvent[];
  userRole: string;
  context: 'date' | 'event' | 'general';
  selectedEvent?: CalendarEvent;
  onAction: (action: string, data?: any) => void;
  compact?: boolean;
}

const QuickActions = ({
  date,
  events,
  userRole,
  context,
  selectedEvent,
  onAction,
  compact = false
}: QuickActionsProps) => {
  
  // Get available actions based on context and user role
  const getAvailableActions = () => {
    const actions = [];

    if (context === 'date') {
      // Date-specific actions
      if (userRole === 'coachx7' || userRole === 'admin1') {
        actions.push({
          id: 'log-hours',
          label: 'Log Hours',
          icon: Clock,
          color: 'blue',
          description: 'Log work hours for this date'
        });
      }

      if (userRole === 'admin1' || userRole === 'coachx7') {
        actions.push({
          id: 'create-event',
          label: 'Schedule Event',
          icon: Calendar,
          color: 'green',
          description: 'Create a new event'
        });
      }

      if (userRole === 'admin1') {
        actions.push({
          id: 'add-holiday',
          label: 'Add Holiday',
          icon: Home,
          color: 'purple',
          description: 'Mark as holiday'
        });
      }

      // Universal date actions
      actions.push({
        id: 'copy-date',
        label: 'Copy Date',
        icon: Copy,
        color: 'gray',
        description: 'Copy date to clipboard'
      });

      if (events.length > 0) {
        actions.push({
          id: 'export-day',
          label: 'Export Day',
          icon: Download,
          color: 'indigo',
          description: 'Export all events for this day'
        });
      }
    }

    if (context === 'event' && selectedEvent) {
      // Event-specific actions
      if (userRole === 'admin1' || (userRole === 'coachx7' && selectedEvent.coach_name)) {
        actions.push({
          id: 'edit-event',
          label: 'Edit',
          icon: Edit,
          color: 'blue',
          description: 'Edit this event'
        });
      }

      actions.push({
        id: 'copy-event',
        label: 'Copy Details',
        icon: Copy,
        color: 'gray',
        description: 'Copy event details'
      });

      actions.push({
        id: 'share-event',
        label: 'Share',
        icon: Share2,
        color: 'green',
        description: 'Share event details'
      });

      if (selectedEvent.client_name) {
        actions.push({
          id: 'contact-client',
          label: 'Contact Client',
          icon: Phone,
          color: 'blue',
          description: 'Contact the client'
        });
      }

      actions.push({
        id: 'add-note',
        label: 'Add Note',
        icon: FileText,
        color: 'yellow',
        description: 'Add a note to this event'
      });

      if (selectedEvent.priority !== 'urgent') {
        actions.push({
          id: 'mark-urgent',
          label: 'Mark Urgent',
          icon: Bell,
          color: 'red',
          description: 'Mark as urgent'
        });
      }

      actions.push({
        id: 'duplicate-event',
        label: 'Duplicate',
        icon: Plus,
        color: 'green',
        description: 'Create a copy of this event'
      });

      if (userRole === 'admin1' || (userRole === 'coachx7' && selectedEvent.coach_name)) {
        actions.push({
          id: 'delete-event',
          label: 'Delete',
          icon: Trash2,
          color: 'red',
          description: 'Delete this event'
        });
      }
    }

    if (context === 'general') {
      // General calendar actions
      actions.push({
        id: 'create-event',
        label: 'New Event',
        icon: Plus,
        color: 'green',
        description: 'Create a new event'
      });

      actions.push({
        id: 'export-calendar',
        label: 'Export Calendar',
        icon: Download,
        color: 'indigo',
        description: 'Export calendar data'
      });

      if (userRole === 'admin1') {
        actions.push({
          id: 'bulk-import',
          label: 'Bulk Import',
          icon: FileText,
          color: 'purple',
          description: 'Import multiple events'
        });
      }
    }

    return actions;
  };

  // Handle action click
  const handleActionClick = async (actionId: string) => {
    switch (actionId) {
      case 'copy-date':
        await copyToClipboard(date.toDateString());
        break;
      case 'copy-event':
        if (selectedEvent) {
          const eventText = formatEventForCopy(selectedEvent);
          await copyToClipboard(eventText);
        }
        break;
      case 'export-day':
        exportDayEvents();
        break;
      default:
        onAction(actionId, { date, event: selectedEvent, events });
    }
  };

  // Utility functions
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onAction('show-toast', { message: 'Copied to clipboard!', type: 'success' });
    } catch (err) {
      console.error('Failed to copy:', err);
      onAction('show-toast', { message: 'Failed to copy', type: 'error' });
    }
  };

  const formatEventForCopy = (event: CalendarEvent) => {
    let text = `${event.title}\n`;
    text += `Date: ${event.event_date}\n`;
    if (event.start_time !== 'All Day') {
      text += `Time: ${event.start_time} - ${event.end_time}\n`;
    }
    if (event.location) text += `Location: ${event.location}\n`;
    if (event.client_name) text += `Client: ${event.client_name}\n`;
    if (event.coach_name) text += `Coach: ${event.coach_name}\n`;
    if (event.description) text += `Description: ${event.description}\n`;
    return text;
  };

  const exportDayEvents = () => {
    const dayEventsText = events.map(formatEventForCopy).join('\n---\n');
    const blob = new Blob([dayEventsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events-${date.toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onAction('show-toast', { message: 'Events exported!', type: 'success' });
  };

  // Get color classes for action buttons
  const getColorClasses = (color: string) => {
    const colorMap = {
      blue: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200',
      green: 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200',
      purple: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200',
      red: 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200',
      yellow: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border-yellow-200',
      indigo: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200',
      gray: 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200'
    };
    return colorMap[color as keyof typeof colorMap] || colorMap.gray;
  };

  const availableActions = getAvailableActions();

  if (availableActions.length === 0) {
    return null;
  }

  return (
    <div className="p-3 border-t border-[hsl(var(--border))]">
      <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-3 uppercase tracking-wide">
        Quick Actions
      </div>
      
      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {availableActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => handleActionClick(action.id)}
              className={`
                flex items-center space-x-2 px-3 py-2 text-xs rounded-md border transition-all duration-200
                hover:scale-105 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1
                ${getColorClasses(action.color)}
              `}
              title={action.description}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{action.label}</span>
            </button>
          );
        })}
      </div>

      {/* Additional context-specific actions */}
      {context === 'date' && events.length > 0 && (
        <div className="mt-3 pt-2 border-t border-[hsl(var(--border))]">
          <div className="text-xs text-[hsl(var(--muted-foreground))] mb-2">
            Day Summary
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-[hsl(var(--muted))] p-2 rounded">
              <div className="font-medium">{events.length}</div>
              <div className="text-[hsl(var(--muted-foreground))]">Events</div>
            </div>
            <div className="bg-[hsl(var(--muted))] p-2 rounded">
              <div className="font-medium">
                {events.filter(e => e.is_hour_log).reduce((sum, e) => sum + (e.duration_minutes / 60), 0).toFixed(1)}h
              </div>
              <div className="text-[hsl(var(--muted-foreground))]">Logged</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickActions;