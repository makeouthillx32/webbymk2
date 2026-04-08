// app/dashboard/[id]/messages/_components/ChatInfoSection.tsx
'use client';

interface ChatInfoSectionProps {
  selectedChatName: string;
  participantCount: number;
  isGroup: boolean;
}

export default function ChatInfoSection({ 
  selectedChatName, 
  participantCount, 
  isGroup 
}: ChatInfoSectionProps) {
  return (
    <div style={{
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      borderBottom: '1px solid hsl(var(--border))',
      backgroundColor: 'hsl(var(--card))',
      flexShrink: 0
    }}>
      <div style={{
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        overflow: 'hidden',
        backgroundColor: 'hsl(var(--sidebar-primary))',
        marginBottom: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-sm)'
      }}>
        {isGroup ? (
          <span style={{
            fontSize: '20px',
            fontWeight: '600',
            color: 'hsl(var(--sidebar-primary-foreground))'
          }}>G</span>
        ) : (
          <span style={{
            fontSize: '20px',
            fontWeight: '600',
            color: 'hsl(var(--sidebar-primary-foreground))'
          }}>
            {selectedChatName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <h3 style={{
        fontWeight: '600',
        fontSize: '16px',
        textAlign: 'center',
        color: 'hsl(var(--card-foreground))',
        margin: '0 0 4px 0'
      }}>{selectedChatName}</h3>
      <p style={{
        fontSize: '12px',
        color: 'hsl(var(--muted-foreground))',
        textAlign: 'center',
        margin: 0
      }}>
        {participantCount}{' '}
        {participantCount === 1 ? 'participant' : 'participants'}
      </p>
    </div>
  );
}