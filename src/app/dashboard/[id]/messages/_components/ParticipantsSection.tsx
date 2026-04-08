// app/dashboard/[id]/messages/_components/ParticipantsSection.tsx
'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';

interface Participant {
  id: string;
  name: string;
  avatar: string;
  email: string;
  online: boolean;
}

interface ParticipantsSectionProps {
  participants: Participant[];
  isGroup: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function ParticipantsSection({ 
  participants, 
  isGroup, 
  isCollapsed, 
  onToggle 
}: ParticipantsSectionProps) {
  
  // Chart colors from design system for avatar backgrounds
  const chartColors = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))'
  ];

  const renderAvatar = (avatar: string, name: string) => {
    if (avatar.startsWith('http')) {
      return (
        <img
          src={avatar}
          alt={`${name}'s avatar`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
      );
    }
    
    // Calculate a deterministic index based on avatar string
    const index = avatar.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % chartColors.length;
    
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: chartColors[index]
      }}>
        <span style={{
          fontSize: '12px',
          fontWeight: '600',
          textTransform: 'uppercase',
          color: 'hsl(var(--primary-foreground))'
        }}>
          {avatar}
        </span>
      </div>
    );
  };

  return (
    <div style={{
      borderBottom: '1px solid hsl(var(--border))',
      backgroundColor: 'hsl(var(--card))',
      flexShrink: 0
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'transparent',
          border: 'none',
          color: 'hsl(var(--foreground))',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--accent) / 0.5)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <span>{isGroup ? 'Participants' : 'About'}</span>
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
      </button>
      
      {!isCollapsed && (
        <div style={{ padding: '0 16px 12px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {participants.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  position: 'relative',
                  marginRight: '8px',
                  boxShadow: 'var(--shadow-xs)'
                }}>
                  {renderAvatar(p.avatar, p.name)}
                  {p.online && (
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: '6px',
                      height: '6px',
                      backgroundColor: 'hsl(var(--chart-2))',
                      borderRadius: '50%',
                      border: '1px solid hsl(var(--background))'
                    }}></div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontWeight: '500',
                    color: 'hsl(var(--card-foreground))',
                    margin: 0,
                    fontSize: '14px'
                  }}>{p.name}</p>
                  <p style={{
                    fontSize: '11px',
                    color: 'hsl(var(--muted-foreground))',
                    margin: 0
                  }}>
                    {p.online ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}