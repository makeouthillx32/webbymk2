// app/dashboard/[id]/messages/_components/ConversationList.tsx
'use client';

import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { Conversation } from './ChatSidebar';
import ConversationListItem from './ConversationListItem';

interface ConversationListProps {
  conversations: Conversation[];
  isLoading: boolean;
  searchQuery: string;
  selectedChat: Conversation | null;
  onSelectChat: (conv: Conversation) => void;
}

export default function ConversationList({
  conversations,
  isLoading,
  searchQuery,
  selectedChat,
  onSelectChat,
}: ConversationListProps) {
  // Internal timestamp formatting
  const formatTimestamp = (ts: string | null) =>
    ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : '';

  // Internal filtering logic
  const filteredConversations = searchQuery.trim()
    ? conversations.filter(conv =>
        conv.channel_name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        conv.participants.some(p => 
          p.display_name?.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
          p.email?.toLowerCase().includes(searchQuery.toLowerCase().trim())
        )
      )
    : conversations;

  // Loading state
  if (isLoading) {
    return (
      <div className="overflow-y-auto flex-1">
        <div className="p-4 text-center" style={{
          color: 'hsl(var(--muted-foreground))'
        }}>
          <div className="flex flex-col items-center gap-2">
            <div className="animate-pulse w-4 h-4 rounded-full" style={{
              backgroundColor: 'hsl(var(--muted))'
            }}></div>
            <span>Loading conversations...</span>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (filteredConversations.length === 0) {
    return (
      <div className="overflow-y-auto flex-1">
        <div className="p-4 text-center" style={{
          color: 'hsl(var(--muted-foreground))'
        }}>
          <div className="flex flex-col items-center gap-3">
            {searchQuery ? (
              <>
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{
                  backgroundColor: 'hsl(var(--muted))'
                }}>
                  <span className="text-lg">🔍</span>
                </div>
                <div className="text-center">
                  <p className="font-medium">No matches found</p>
                  <p className="text-sm mt-1" style={{
                    color: 'hsl(var(--muted-foreground))'
                  }}>
                    Try adjusting your search terms
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{
                  backgroundColor: 'hsl(var(--muted))'
                }}>
                  <span className="text-lg">💬</span>
                </div>
                <div className="text-center">
                  <p className="font-medium">No conversations yet</p>
                  <p className="text-sm mt-1" style={{
                    color: 'hsl(var(--muted-foreground))'
                  }}>
                    Start a new chat to get started
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Conversations list
  return (
    <div className="overflow-y-auto flex-1" style={{
      backgroundColor: 'hsl(var(--sidebar))',
      overscrollBehavior: 'contain'
    }}>
      <div className="py-1">
        {filteredConversations.map((conv) => (
          <ConversationListItem
            key={conv.id}
            conv={conv}
            isSelected={selectedChat?.id === conv.id}
            formatTimestamp={formatTimestamp}
            onSelect={onSelectChat}
          />
        ))}
      </div>
      
      {/* Search results info */}
      {searchQuery && filteredConversations.length > 0 && (
        <div className="px-4 py-2 text-xs text-center" style={{
          color: 'hsl(var(--muted-foreground))',
          borderTop: '1px solid hsl(var(--sidebar-border))'
        }}>
          {filteredConversations.length} of {conversations.length} conversations
        </div>
      )}
    </div>
  );
}