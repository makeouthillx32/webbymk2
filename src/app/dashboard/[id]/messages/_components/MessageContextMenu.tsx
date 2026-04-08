// app/dashboard/[id]/messages/_components/MessageContextMenu.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';

interface MessageContextMenuProps {
  messageId: string | number;
  messageContent: string;
  messageElement: HTMLElement;
  canDelete: boolean;
  onDelete: () => void;
  onCopy: (content: string) => void;
  onClose: () => void;
  className?: string;
}

export default function MessageContextMenu({ 
  messageId, 
  messageContent, 
  messageElement, 
  canDelete, 
  onDelete, 
  onCopy, 
  onClose,
  className = ""
}: MessageContextMenuProps) {
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

      // Keep menu within viewport
      if (x < 10) x = 10;
      if (x + menuRect.width > viewport.width - 10) {
        x = viewport.width - menuRect.width - 10;
      }
      
      // If menu would go above viewport, show below message
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
      className={`message-context-menu ${className}`}
      style={{ 
        left: position.x, 
        top: position.y,
        backgroundColor: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)',
        position: 'fixed',
        zIndex: 9999,
        minWidth: '160px',
        padding: '6px',
        animation: 'context-menu-appear 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      {/* Copy action */}
      <button
        onClick={handleCopy}
        className="context-menu-item copy-item w-full flex items-center gap-2 p-2 rounded text-sm hover:bg-[hsl(var(--accent))] transition-colors"
        style={{
          borderRadius: 'calc(var(--radius) - 2px)',
          color: 'hsl(var(--foreground))',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer'
        }}
      >
        <Copy size={16} />
        Copy Message
      </button>

      {/* Delete action (if user can delete) */}
      {canDelete && (
        <>
          <div className="border-t border-[hsl(var(--border))] my-1"></div>
          <button
            onClick={handleDelete}
            className="context-menu-item delete-item w-full flex items-center gap-2 p-2 rounded text-sm hover:bg-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive-foreground))] transition-colors"
            style={{
              borderRadius: 'calc(var(--radius) - 2px)',
              color: 'hsl(var(--destructive))',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <Trash2 size={16} />
            Delete Message
          </button>
        </>
      )}
    </div>
  );
}