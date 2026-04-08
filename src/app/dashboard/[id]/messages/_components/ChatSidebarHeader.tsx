// app/dashboard/[id]/messages/_components/ChatSidebarHeader.tsx
'use client';

import React from 'react';
import { PlusCircle, MessageSquarePlus } from 'lucide-react';

interface ChatSidebarHeaderProps {
  onNewChat?: () => void;
  title?: string;
  showNewChatButton?: boolean;
  className?: string;
}

export default function ChatSidebarHeader({ 
  onNewChat,
  title = "My Chats",
  showNewChatButton = true,
  className = ""
}: ChatSidebarHeaderProps) {
  
  const handleNewChatClick = () => {
    if (onNewChat) {
      onNewChat();
    }
  };

  return (
    <div className={`p-3 flex justify-between items-center border-b border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] flex-shrink-0 ${className}`}>
      <h1 className="font-semibold text-lg text-[hsl(var(--sidebar-foreground))] truncate">
        {title}
      </h1>
      
      {showNewChatButton && (
        <button
          onClick={handleNewChatClick}
          className="p-2 bg-[hsl(var(--sidebar-primary))] hover:bg-[hsl(var(--sidebar-primary))]/90 rounded-full text-[hsl(var(--sidebar-primary-foreground))] flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]"
          title="Start new conversation"
          type="button"
          aria-label="Start new conversation"
        >
          <MessageSquarePlus size={18} />
        </button>
      )}
    </div>
  );
}

// Export variations for different use cases
export function ChatSidebarHeaderMinimal({ 
  onNewChat, 
  className = "" 
}: { 
  onNewChat?: () => void; 
  className?: string; 
}) {
  return (
    <ChatSidebarHeader
      onNewChat={onNewChat}
      title="Chats"
      className={className}
    />
  );
}

export function ChatSidebarHeaderWithCount({ 
  onNewChat, 
  chatCount = 0,
  className = ""
}: { 
  onNewChat?: () => void; 
  chatCount?: number;
  className?: string;
}) {
  return (
    <div className={`p-3 flex justify-between items-center border-b border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] flex-shrink-0 ${className}`}>
      <div className="flex flex-col">
        <h1 className="font-semibold text-lg text-[hsl(var(--sidebar-foreground))]">
          My Chats
        </h1>
        <span className="text-xs text-[hsl(var(--sidebar-foreground))]/60">
          {chatCount} conversation{chatCount !== 1 ? 's' : ''}
        </span>
      </div>
      
      <button
        onClick={onNewChat}
        className="p-2 bg-[hsl(var(--sidebar-primary))] hover:bg-[hsl(var(--sidebar-primary))]/90 rounded-full text-[hsl(var(--sidebar-primary-foreground))] flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]"
        title="Start new conversation"
        type="button"
        aria-label="Start new conversation"
      >
        <MessageSquarePlus size={18} />
      </button>
    </div>
  );
}