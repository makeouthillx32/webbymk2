// app/dashboard/[id]/messages/_components/ChatRightSidebarHeader.tsx
'use client';

import { X } from 'lucide-react';

interface ChatRightSidebarHeaderProps {
  isGroup: boolean;
  onClose: () => void;
}

export default function ChatRightSidebarHeader({ isGroup, onClose }: ChatRightSidebarHeaderProps) {
  return (
    <div style={{
      padding: '12px 16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid hsl(var(--border))',
      backgroundColor: 'hsl(var(--card))',
      flexShrink: 0
    }}>
      <h3 style={{
        fontWeight: '600',
        color: 'hsl(var(--card-foreground))',
        margin: 0,
        fontSize: '16px'
      }}>
        {isGroup ? 'Group Info' : 'Chat Info'}
      </h3>
      <button 
        onClick={onClose} 
        style={{
          background: 'transparent',
          border: 'none',
          color: 'hsl(var(--muted-foreground))',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: 'var(--radius)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'hsl(var(--foreground))';
          e.currentTarget.style.backgroundColor = 'hsl(var(--accent))';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}