// app/dashboard/[id]/messages/_components/ChatRightSidebar.tsx
'use client';

import { Image, Pencil } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRealtime } from '@/hooks/useRealtimeInsert';
import { useSharedMedia } from '@/hooks/useSharedMedia';
import { toast } from 'react-hot-toast';
import ChatRightSidebarHeader from './ChatRightSidebarHeader';
import ChatInfoSection from './ChatInfoSection';
import ParticipantsSection from './ParticipantsSection';
import ActionsSection from './ActionsSection';
import SharedMediaSection from './SharedMediaSection';
import { resolveChatDisplayName } from '@/utils/chatPageUtils';
import './ChatRightSidebar.scss';

// Create Supabase client
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Participant {
  user_id: string;
  display_name: string;
  avatar_url: string;
  email: string;
  online: boolean;
}

interface SelectedChat {
  id: string;
  channel_id: string;
  channel_name: string;
  is_group: boolean;
  participants: Participant[];
  last_message_at: string | null;
}

interface Props {
  selectedChat: SelectedChat;
  currentUserId?: string | null;
  onClose: () => void;
  onConversationDeleted?: (channelId: string) => void;
}

export default function ChatRightSidebar({
  selectedChat,
  currentUserId,
  onClose,
  onConversationDeleted
}: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [participants, setParticipants] = useState(selectedChat.participants);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // Collapsible sections state
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    about: false,
    actions: true,
    media: false
  });
  
  const isMounted = useRef(true);

  // Use the shared media hook (same pattern as useMessages)
  const { sharedMedia, loading: loadingMedia, error: mediaError } = useSharedMedia({
    channelId: selectedChat.id,
    enabled: !!selectedChat.id
  });

  // Compute values from selectedChat
  const resolvedName = resolveChatDisplayName(selectedChat, currentUserId);
  const channelId = selectedChat.id;
  const isGroup = selectedChat.is_group;

  // Transform participants for display
  const displayParticipants = participants.map((p) => ({
    id: p.user_id,
    name: p.display_name,
    avatar: p.avatar_url,
    email: p.email,
    online: p.online,
  }));

  // Check screen size for responsive behavior
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  // Update participants when selectedChat changes
  useEffect(() => {
    if (isMounted.current) {
      setParticipants(selectedChat.participants);
    }
  }, [selectedChat.participants]);
  
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  // Monitor presence/online status changes
  useRealtime<any>({
    supabase,
    table: 'presence',
    filter: channelId ? `channel_id=eq.${channelId}` : undefined,
    event: '*',
    enabled: !!channelId,
    onEvent: ({ new: newState, old: oldState, eventType }) => {
      if (!isMounted.current || !channelId) return;
      
      console.log(`[RightSidebar] Presence event: ${eventType}`, newState);
      
      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        setParticipants(prev => {
          return prev.map(p => {
            if (p.user_id === newState.user_id) {
              return {
                ...p,
                online: newState.status === 'online'
              };
            }
            return p;
          });
        });
      }
    }
  });

  // Toggle section collapse
  const toggleSection = (section: 'about' | 'actions' | 'media') => {
    setSectionsCollapsed(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Show error if media loading failed
  useEffect(() => {
    if (mediaError) {
      console.error('[RightSidebar] Media loading error:', mediaError);
      // Don't show toast for media errors - not critical
    }
  }, [mediaError]);

  // Debug logging
  useEffect(() => {
    console.log('[RightSidebar] Media state:', {
      mediaCount: sharedMedia.length,
      loading: loadingMedia,
      error: mediaError
    });
  }, [sharedMedia.length, loadingMedia, mediaError]);

  // Determine if we should show as overlay (mobile/tablet) or sidebar (desktop)
  const shouldShowAsOverlay = isMobile || isTablet;

  if (!isOpen) {
    return (
      <div style={{
        width: '48px',
        display: shouldShowAsOverlay ? 'none' : 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid hsl(var(--border))',
        backgroundColor: 'hsl(var(--card))'
      }} className="lg:flex">
        <button 
          onClick={() => setIsOpen(true)} 
          style={{
            padding: '8px',
            background: 'transparent',
            border: 'none',
            color: 'hsl(var(--foreground))',
            cursor: 'pointer',
            borderRadius: 'var(--radius)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--accent))'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Pencil size={16} />
        </button>
        <button 
          onClick={() => setIsOpen(true)} 
          style={{
            padding: '8px',
            background: 'transparent',
            border: 'none',
            color: 'hsl(var(--foreground))',
            cursor: 'pointer',
            borderRadius: 'var(--radius)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--accent))'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Image size={16} />
        </button>
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      backgroundColor: 'hsl(var(--card))',
      color: 'hsl(var(--card-foreground))',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: 'var(--shadow-md)',
      overflowY: 'auto'
    }}>
      <ChatRightSidebarHeader 
        isGroup={isGroup} 
        onClose={onClose} 
      />

      <ChatInfoSection 
        selectedChatName={resolvedName}
        participantCount={participants.length}
        isGroup={isGroup}
      />

      <ParticipantsSection 
        participants={displayParticipants}
        isGroup={isGroup}
        isCollapsed={sectionsCollapsed.about}
        onToggle={() => toggleSection('about')}
      />

      <ActionsSection 
        isGroup={isGroup}
        isCollapsed={sectionsCollapsed.actions}
        channelId={channelId}
        onToggle={() => toggleSection('actions')}
        onConversationDeleted={onConversationDeleted}
        onClose={onClose}
      />

      <SharedMediaSection 
        sharedMedia={sharedMedia}
        loadingMedia={loadingMedia}
        isCollapsed={sectionsCollapsed.media}
        onToggle={() => toggleSection('media')}
      />
    </div>
  );
}