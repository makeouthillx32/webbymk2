'use client';

import { Info, Phone, Video, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { resolveChatDisplayName } from '@/utils/chatPageUtils';
import './ChatHeader.scss';

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
  channel_name?: string;
  is_group: boolean;
  participants: Participant[];
  last_message_at?: string | null;
}

interface ChatHeaderProps {
  selectedChat: SelectedChat | null;
  currentUserId: string | null;
  onInfoClick?: () => void;
  onBackClick?: () => void;
  showBackButton?: boolean;
}

export default function ChatHeader({
  selectedChat,
  currentUserId,
  onInfoClick,
  onBackClick,
  showBackButton = false
}: ChatHeaderProps) {
  if (!selectedChat) {
    return (
      <header className="chat-header">
        <div className="chat-header-title">
          <h2 className="text-xl font-semibold truncate">No chat selected</h2>
        </div>
      </header>
    );
  }

  const resolvedName = resolveChatDisplayName(selectedChat, currentUserId);
  const isGroup = selectedChat.is_group;
  const timestamp = selectedChat.last_message_at || null;

  // Enhanced title logic for DM conversations
  let displayTitle = resolvedName;

  if (!isGroup && selectedChat.participants?.length === 2) {
    const otherParticipant = selectedChat.participants.find(p => p.user_id !== currentUserId);
    if (otherParticipant) {
      displayTitle = otherParticipant.display_name || 'Unknown User';
    }
  }

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return null;
    try {
      return `Last message ${formatDistanceToNow(new Date(ts), { addSuffix: true })}`;
    } catch {
      return null;
    }
  };

  const formattedTimestamp = formatTimestamp(timestamp);

  const getOnlineStatus = () => {
    if (!isGroup && selectedChat.participants?.length === 2) {
      const otherParticipant = selectedChat.participants.find(p => p.user_id !== currentUserId);
      return otherParticipant?.online ? 'Online' : 'Offline';
    }
    return null;
  };

  const onlineStatus = getOnlineStatus();

  return (
    <header className="chat-header">
      {showBackButton && onBackClick && (
        <button 
          onClick={onBackClick}
          className="chat-header-back-button mr-2 md:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft size={20} />
        </button>
      )}

      <div className="chat-header-title">
        <h2 className="text-xl font-semibold truncate">{displayTitle}</h2>
        {onlineStatus ? (
          <p className={`text-sm truncate ${onlineStatus === 'Online' ? 'text-green-500' : 'text-gray-500'}`}>
            {onlineStatus}
          </p>
        ) : formattedTimestamp ? (
          <p className="text-sm text-gray-500 truncate">
            {formattedTimestamp}
          </p>
        ) : null}
      </div>

      <div className="chat-header-actions">
        {!isGroup && (
          <>
            <button 
              className="hidden md:flex"
              title="Video call"
              onClick={() => console.log('Video call clicked')}
            >
              <Video size={20} />
            </button>
            <button 
              className="hidden md:flex"
              title="Voice call"
              onClick={() => console.log('Voice call clicked')}
            >
              <Phone size={20} />
            </button>
          </>
        )}
        <button 
          onClick={onInfoClick}
          title="Chat info"
        >
          <Info size={20} />
        </button>
      </div>
    </header>
  );
}
