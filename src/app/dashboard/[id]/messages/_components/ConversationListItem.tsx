'use client';

import React from 'react';
import type { Conversation } from './ChatSidebar';

interface ConversationListItemProps {
  conv: Conversation;
  isSelected: boolean;
  formatTimestamp: (ts: string | null) => string;
  onSelect: (chat: Conversation) => void;
}

export default function ConversationListItem({ conv, isSelected, formatTimestamp, onSelect }: ConversationListItemProps) {
  // Generate a deterministic color for the conversation avatar
  const getAvatarColor = (name: string) => {
    // Chart colors from design system
    const chartColors = [
      'bg-[hsl(var(--chart-1))]',
      'bg-[hsl(var(--chart-2))]',
      'bg-[hsl(var(--chart-3))]',
      'bg-[hsl(var(--chart-4))]',
      'bg-[hsl(var(--chart-5))]'
    ];
    
    // Calculate a simple hash based on the name
    const hashValue = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colorIndex = hashValue % chartColors.length;
    
    return chartColors[colorIndex];
  };

  const avatarColor = getAvatarColor(conv.channel_name);

  return (
    <button
      onClick={() => onSelect(conv)}
      className={`w-full text-left p-3 transition-colors rounded-[var(--radius)] hover:bg-[hsl(var(--sidebar-accent))] ${
        isSelected ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]' : 'text-[hsl(var(--sidebar-foreground))]'
      }`}
    >
      <div className="flex items-center">
        <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center text-[hsl(var(--primary-foreground))] mr-3 shadow-[var(--shadow-xs)]`}>
          <span>{conv.channel_name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center">
            <span className="font-medium truncate">{conv.channel_name}</span>
            {conv.last_message_at && (
              <span className="text-xs text-[hsl(var(--muted-foreground))] ml-1 whitespace-nowrap">
                {formatTimestamp(conv.last_message_at).replace(/about|less than/, '')}
              </span>
            )}
          </div>
          <div className="flex items-center">
            <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
              {conv.last_message ?? 'No messages yet'}
            </p>
            {conv.unread_count > 0 && (
              <span className="ml-2 bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] text-xs rounded-full w-5 h-5 flex items-center justify-center shadow-[var(--shadow-2xs)]">
                {conv.unread_count > 9 ? '9+' : conv.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}