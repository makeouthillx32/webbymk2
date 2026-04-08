'use client';

import { Heart, Trash2, MoreVertical, Copy } from 'lucide-react';
import { format } from 'date-fns';
import { useState, useRef, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'react-hot-toast';
import './ChatMessages.scss';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

interface ChatMessagesProps {
  messages: Message[];
  currentUserId: string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>; // Fixed type to allow null
  avatarColors: Record<string, string>;
  onMessageDelete?: (messageId: string | number) => void;
}

interface ContextMenuProps {
  messageId: string | number;
  messageContent: string;
  messageElement: HTMLElement;
  canDelete: boolean;
  onDelete: () => void;
  onCopy: (content: string) => void;
  onClose: () => void;
}

function MessageContextMenu({ 
  messageId, 
  messageContent, 
  messageElement, 
  canDelete, 
  onDelete, 
  onCopy, 
  onClose 
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const updatePosition = () => {
    if (messageElement && menuRef.current) {
      const messageRect = messageElement.getBoundingClientRect();
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      };

      let x = messageRect.left + messageRect.width / 2 - menuRect.width / 2;
      let y = messageRect.top - menuRect.height - 10;

      if (x < 10) x = 10;
      if (x + menuRect.width > viewport.width - 10) {
        x = viewport.width - menuRect.width - 10;
      }
      
      if (y < 10) {
        y = messageRect.bottom + 10;
      }

      setPosition({ x, y });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleScroll = () => {
      updatePosition();
    };

    updatePosition();

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', updatePosition);

    const intervalId = setInterval(updatePosition, 16);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', updatePosition);
      clearInterval(intervalId);
    };
  }, [messageElement, onClose]);

  const handleCopy = () => {
    onCopy(messageContent);
    onClose();
  };

  const handleDelete = () => {
    onDelete();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="message-context-menu"
      style={{ 
        left: position.x, 
        top: position.y,
        backgroundColor: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)',
        position: 'fixed',
        zIndex: 9999
      }}
    >
      <button
        onClick={handleCopy}
        className="context-menu-item copy-item"
        style={{
          borderRadius: 'calc(var(--radius) - 2px)',
          color: 'hsl(var(--foreground))'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'hsl(var(--accent))';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Copy size={16} />
        Copy Message
      </button>
      {canDelete && (
        <button
          onClick={handleDelete}
          className="context-menu-item delete-item"
          style={{
            borderRadius: 'calc(var(--radius) - 2px)',
            color: 'hsl(var(--destructive))'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'hsl(var(--destructive))';
            e.currentTarget.style.color = 'hsl(var(--destructive-foreground))';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'hsl(var(--destructive))';
          }}
        >
          <Trash2 size={16} />
          Delete Message
        </button>
      )}
    </div>
  );
}

export default function ChatMessages({
  messages,
  currentUserId,
  messagesEndRef,
  avatarColors,
  onMessageDelete
}: ChatMessagesProps) {
  const [contextMenu, setContextMenu] = useState<{
    messageId: string | number;
    messageContent: string;
    messageElement: HTMLElement;
    canDelete: boolean;
  } | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | number | null>(null);

  const formatMessageTime = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'h:mm a');
    } catch {
      return '';
    }
  };

  const renderAvatar = (avatar: string, name: string) => {
    if (avatar.startsWith('http')) {
      return (
        <img
          src={avatar}
          alt={`${name}'s avatar`}
          className="w-full h-full object-cover"
        />
      );
    }
    
    const chartColors = [
      'bg-[hsl(var(--chart-1))]',
      'bg-[hsl(var(--chart-2))]',
      'bg-[hsl(var(--chart-3))]',
      'bg-[hsl(var(--chart-4))]',
      'bg-[hsl(var(--chart-5))]'
    ];
    
    const index = avatar.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % chartColors.length;
    
    return (
      <div className={`avatar-initials ${chartColors[index]}`}>
        <span className="text-xs font-semibold uppercase text-[hsl(var(--primary-foreground))]">{avatar}</span>
      </div>
    );
  };

  const handleContextMenu = (e: React.MouseEvent, messageId: string | number, messageContent: string, senderId: string) => {
    e.preventDefault();
    
    const canDelete = senderId === currentUserId;
    const messageElement = e.currentTarget as HTMLElement;
    
    setContextMenu({
      messageId,
      messageContent,
      messageElement,
      canDelete
    });
  };

  const handleTouchStart = (messageId: string | number, messageContent: string, senderId: string, element: HTMLElement) => {
    const timer = setTimeout(() => {
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      
      const canDelete = senderId === currentUserId;
      
      setContextMenu({
        messageId,
        messageContent,
        messageElement: element,
        canDelete
      });
    }, 500);
    
    setLongPressTimer(timer);
  };

  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const copyMessage = async (content: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
        toast.success('Message copied to clipboard');
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
          toast.success('Message copied to clipboard');
        } catch (err) {
          toast.error('Failed to copy message');
        } finally {
          textArea.remove();
        }
      }
    } catch (err) {
      console.error('Copy error:', err);
      toast.error('Failed to copy message');
    }
  };

  const deleteMessage = async (messageId: string | number) => {
    try {
      setIsDeleting(messageId);
      setContextMenu(null);

      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId);

      if (error) {
        console.error('Delete error:', error);
        toast.error('Failed to delete message');
        return;
      }

      if (onMessageDelete) {
        onMessageDelete(messageId);
      }

      toast.success('Message deleted');
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to delete message');
    } finally {
      setIsDeleting(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div 
      className="chat-messages"
      style={{
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))'
      }}
    >
      {messages.map((message) => {
        const isCurrentUser = message.sender.id === currentUserId;
        const canDelete = isCurrentUser;
        const isBeingDeleted = isDeleting === message.id;
        
        return (
          <div
            key={String(message.id)}
            className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-3 ${
              isBeingDeleted ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            {!isCurrentUser && (
              <div className="flex-shrink-0 mr-2">
                <div className="message-avatar rounded-full overflow-hidden shadow-[var(--shadow-xs)]">
                  {renderAvatar(message.sender.avatar, message.sender.name)}
                </div>
              </div>
            )}
            <div className={`message ${isCurrentUser ? 'order-1' : 'order-2'} relative group`}>
              {!isCurrentUser && (
                <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1 ml-1 font-[var(--font-sans)]">
                  {message.sender.name}
                </div>
              )}
              <div className="flex flex-col">
                <div
                  className={`message-bubble shadow-[var(--shadow-xs)] relative ${
                    isCurrentUser
                      ? 'rounded-tr-none'
                      : 'rounded-tl-none'
                  } rounded-[var(--radius)] cursor-pointer`}
                  style={{
                    backgroundColor: isCurrentUser 
                      ? 'hsl(var(--sidebar-primary))' 
                      : 'hsl(var(--muted))',
                    color: isCurrentUser 
                      ? 'hsl(var(--sidebar-primary-foreground))' 
                      : 'hsl(var(--foreground))',
                    boxShadow: 'var(--shadow-md)'
                  }}
                  onContextMenu={(e) => handleContextMenu(e, message.id, message.content, message.sender.id)}
                  onTouchStart={(e) => handleTouchStart(message.id, message.content, message.sender.id, e.currentTarget)}
                  onTouchEnd={handleTouchEnd}
                  onTouchCancel={handleTouchEnd}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  }}
                >
                  <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 md:block hidden">
                    <div 
                      className="rounded-full p-1 shadow-sm"
                      style={{
                        backgroundColor: 'hsl(var(--muted))'
                      }}
                    >
                      <MoreVertical size={12} className="text-[hsl(var(--muted-foreground))]" />
                    </div>
                  </div>
                  {message.content && (
                    <p className="text-sm break-words">{message.content}</p>
                  )}
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
                                style={{
                                  backgroundColor: 'hsl(var(--muted))'
                                }}
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
                <div className="flex items-center mt-1 ml-1">
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    {formatMessageTime(message.timestamp)}
                  </span>
                  {message.likes > 0 && (
                    <div className="ml-2 flex items-center text-xs text-[hsl(var(--destructive))]">
                      <Heart size={12} fill="currentColor" className="mr-1" />
                      {message.likes}
                    </div>
                  )}
                  {isBeingDeleted && (
                    <div className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
                      Deleting...
                    </div>
                  )}
                </div>
              </div>
            </div>
            {isCurrentUser && (
              <div className="flex-shrink-0 ml-2">
                <div className="message-avatar rounded-full overflow-hidden shadow-[var(--shadow-xs)]">
                  {renderAvatar(message.sender.avatar, message.sender.name)}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {contextMenu && (
        <MessageContextMenu
          messageId={contextMenu.messageId}
          messageContent={contextMenu.messageContent}
          messageElement={contextMenu.messageElement}
          canDelete={contextMenu.canDelete}
          onDelete={() => deleteMessage(contextMenu.messageId)}
          onCopy={copyMessage}
          onClose={() => setContextMenu(null)}
        />
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}