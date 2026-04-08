// app/dashboard/[id]/messages/_components/MessageItem.tsx
'use client';

import { MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';

interface Attachment {
  id: string;
  url: string;
  type: string;
  name: string;
  size: number;
}

interface Message {
  id: string | number;
  sender: {
    id: string;
    name: string;
    avatar: string;
    email: string;
  };
  content: string;
  timestamp: string;
  likes: number;
  image: string | null;
  attachments?: Attachment[];
}

interface MessageItemProps {
  message: Message;
  currentUserId: string | null;
  isDeleting?: boolean;
  onContextMenu: (e: React.MouseEvent, messageId: string | number, messageContent: string, senderId: string) => void;
  onTouchStart: (messageId: string | number, messageContent: string, senderId: string, element: HTMLElement) => void;
  onTouchEnd: () => void;
}

export default function MessageItem({
  message,
  currentUserId,
  isDeleting = false,
  onContextMenu,
  onTouchStart,
  onTouchEnd
}: MessageItemProps) {
  const isCurrentUser = message.sender.id === currentUserId;

  // Avatar rendering logic (combined from MessageAvatar)
  const renderAvatar = (avatar: string, name: string) => {
    // If it's a URL, render image
    if (avatar.startsWith('http')) {
      return (
        <img
          src={avatar}
          alt={`${name}'s avatar`}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to initials if image fails to load
            const target = e.target as HTMLImageElement;
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = generateInitialsAvatar(name);
            }
          }}
        />
      );
    }
    
    // Generate deterministic color based on avatar string
    return generateInitialsAvatar(avatar);
  };

  // Generate initials avatar with deterministic color
  const generateInitialsAvatar = (text: string) => {
    const chartColors = [
      'bg-[hsl(var(--chart-1))]',
      'bg-[hsl(var(--chart-2))]',
      'bg-[hsl(var(--chart-3))]',
      'bg-[hsl(var(--chart-4))]',
      'bg-[hsl(var(--chart-5))]'
    ];
    
    // Create deterministic index based on text
    const index = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % chartColors.length;
    
    return `
      <div class="avatar-initials ${chartColors[index]} w-full h-full flex items-center justify-center">
        <span class="text-xs font-semibold uppercase text-[hsl(var(--primary-foreground))]">
          ${text.charAt(0).toUpperCase()}
        </span>
      </div>
    `;
  };

  // Format message timestamp
  const formatMessageTime = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'h:mm a');
    } catch {
      return '';
    }
  };

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    onContextMenu(e, message.id, message.content, message.sender.id);
  };

  // Handle touch interactions for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    onTouchStart(message.id, message.content, message.sender.id, e.currentTarget as HTMLElement);
  };

  return (
    <div
      className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-3 ${
        isDeleting ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      {/* Avatar for other users (left side) */}
      {!isCurrentUser && (
        <div className="flex-shrink-0 mr-2">
          <div className="message-avatar w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden shadow-[var(--shadow-xs)]">
            <div dangerouslySetInnerHTML={{ __html: renderAvatar(message.sender.avatar, message.sender.name) }} />
          </div>
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

            {/* Message attachments preview */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 space-y-2">
                {message.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-2 p-2 rounded"
                    style={{
                      backgroundColor: 'hsl(var(--background) / 0.5)',
                      border: '1px solid hsl(var(--border) / 0.5)',
                      borderRadius: 'var(--radius)'
                    }}
                  >
                    <div className="flex-shrink-0">
                      {attachment.type === 'image' ? (
                        <img
                          src={attachment.url}
                          alt={attachment.name}
                          className="w-8 h-8 object-cover rounded"
                        />
                      ) : (
                        <div 
                          className="w-8 h-8 rounded flex items-center justify-center"
                          style={{ backgroundColor: 'hsl(var(--muted))' }}
                        >
                          <span className="text-xs">📄</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium hover:underline block truncate"
                      >
                        {attachment.name}
                      </a>
                      <p className="text-xs opacity-70">
                        {formatFileSize(attachment.size)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Message metadata */}
          <div className="flex items-center mt-1 ml-1">
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {formatMessageTime(message.timestamp)}
            </span>
            
            {/* Like count */}
            {message.likes > 0 && (
              <div className="ml-2 flex items-center text-xs text-[hsl(var(--destructive))]">
                <span className="mr-1">❤️</span>
                {message.likes}
              </div>
            )}
            
            {/* Deleting indicator */}
            {isDeleting && (
              <div className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
                Deleting...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Avatar for current user (right side) */}
      {isCurrentUser && (
        <div className="flex-shrink-0 ml-2">
          <div className="message-avatar w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden shadow-[var(--shadow-xs)]">
            <div dangerouslySetInnerHTML={{ __html: renderAvatar(message.sender.avatar, message.sender.name) }} />
          </div>
        </div>
      )}
    </div>
  );
}

// Utility function for file size formatting
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}