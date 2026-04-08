// app/dashboard/[id]/messages/_components/ChatMessageBubble.tsx
'use client';

import React from 'react';
import { MoreVertical } from 'lucide-react';
import MessageAvatar from './MessageAvatar';
import AttachmentList from './AttachmentList';
import TimestampAndLikes from './TimestampAndLikes';

interface Attachment {
  id: string;
  url: string;
  type: string;
  name: string;
  size: number;
}

interface MessageSender {
  id: string;
  name: string;
  avatar: string;
  email: string;
}

interface Message {
  id: string | number;
  sender: MessageSender;
  content: string;
  timestamp: string;
  likes: number;
  image: string | null;
  attachments?: Attachment[];
}

interface ChatMessageBubbleProps {
  message: Message;
  isCurrentUser: boolean;
  isBeingDeleted?: boolean;
  onContextMenu: (e: React.MouseEvent, messageId: string | number, messageContent: string, senderId: string) => void;
  onTouchStart: (messageId: string | number, messageContent: string, senderId: string, element: HTMLElement) => void;
  onTouchEnd: () => void;
  className?: string;
}

export default function ChatMessageBubble({
  message,
  isCurrentUser,
  isBeingDeleted = false,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
  className = ""
}: ChatMessageBubbleProps) {

  const handleContextMenu = (e: React.MouseEvent) => {
    onContextMenu(e, message.id, message.content, message.sender.id);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    onTouchStart(message.id, message.content, message.sender.id, e.currentTarget as HTMLElement);
  };

  return (
    <div
      className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-3 ${
        isBeingDeleted ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      {/* Avatar for other users (left side) */}
      {!isCurrentUser && (
        <div className="flex-shrink-0 mr-2">
          <MessageAvatar 
            avatar={message.sender.avatar} 
            name={message.sender.name}
            isCurrentUser={false}
          />
        </div>
      )}

      {/* Message content */}
      <div className={`message ${isCurrentUser ? 'order-1' : 'order-2'} relative group max-w-[85%] md:max-w-[70%]`}>
        {/* Sender name for other users */}
        {!isCurrentUser && (
          <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1 ml-1 font-[var(--font-sans)]">
            {message.sender.name}
          </div>
        )}

        <div className="flex flex-col">
          {/* Message bubble */}
          <div
            className={`message-bubble shadow-[var(--shadow-xs)] relative ${
              isCurrentUser ? 'rounded-tr-none' : 'rounded-tl-none'
            } rounded-[var(--radius)] cursor-pointer transition-all duration-200 p-2 md:p-3`}
            style={{
              backgroundColor: isCurrentUser 
                ? 'hsl(var(--sidebar-primary))' 
                : 'hsl(var(--muted))',
              color: isCurrentUser 
                ? 'hsl(var(--sidebar-primary-foreground))' 
                : 'hsl(var(--foreground))',
              boxShadow: 'var(--shadow-md)'
            }}
            onContextMenu={handleContextMenu}
            onTouchStart={handleTouchStart}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
          >
            {/* More options indicator (desktop only) */}
            <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 md:block hidden">
              <div 
                className="rounded-full p-1 shadow-sm"
                style={{ backgroundColor: 'hsl(var(--muted))' }}
              >
                <MoreVertical size={12} className="text-[hsl(var(--muted-foreground))]" />
              </div>
            </div>

            {/* Message text content */}
            {message.content && (
              <p className="text-sm break-words">{message.content}</p>
            )}

            {/* Message image */}
            {message.image && (
              <div className="mt-2 message-image overflow-hidden rounded-[calc(var(--radius)_-_2px)]" style={{ maxHeight: '200px', maxWidth: '300px' }}>
                <img
                  src={message.image}
                  alt="Shared"
                  style={{ 
                    width: '100%', 
                    height: 'auto', 
                    maxHeight: '200px', 
                    objectFit: 'cover',
                    display: 'block'
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22100%22%20height=%22100%22%20viewBox=%220%200%20100%20100%22%3E%3Cpath%20fill=%22%23CCC%22%20d=%22M0%200h100v100H0z%22/%3E%3Cpath%20fill=%22%23999%22%20d=%22M40%2040h20v20H40z%22/%3E%3C/svg%3E';
                  }}
                />
              </div>
            )}

            {/* Message attachments */}
            <AttachmentList attachments={message.attachments || []} />
          </div>

          {/* Message metadata */}
          <TimestampAndLikes 
            timestamp={message.timestamp}
            likes={message.likes}
            isBeingDeleted={isBeingDeleted}
          />
        </div>
      </div>

      {/* Avatar for current user (right side) */}
      {isCurrentUser && (
        <div className="flex-shrink-0 ml-2">
          <MessageAvatar 
            avatar={message.sender.avatar} 
            name={message.sender.name}
            isCurrentUser={true}
          />
        </div>
      )}
    </div>
  );
}