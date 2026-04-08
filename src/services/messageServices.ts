// services/messageServices.ts
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'react-hot-toast';
import { type Message, type UserProfile } from './chatPageUtils';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Message Management Service
export class MessageManager {
  constructor(
    private setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    private messagesEndRef: React.RefObject<HTMLDivElement>
  ) {}

  addOptimisticMessage = (message: Message) => {
    console.log('[MessageManager] Adding optimistic message:', message);
    this.setMessages(prev => [...prev, message]);
    this.scrollToBottom();
  };

  removeOptimisticMessage = (messageId: string | number) => {
    console.log('[MessageManager] Removing optimistic message:', messageId);
    this.setMessages(prev => prev.filter(msg => msg.id !== messageId));
  };

  deleteMessage = async (messageId: string | number) => {
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId);

      if (error) {
        console.error('Delete error:', error);
        toast.error('Failed to delete message');
        return false;
      }

      // Remove from local state
      this.setMessages(prev => prev.filter(msg => msg.id !== messageId));
      toast.success('Message deleted');
      return true;
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to delete message');
      return false;
    }
  };

  private scrollToBottom = () => {
    setTimeout(() => {
      if (this.messagesEndRef.current) {
        this.messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  };
}

// Clipboard Service
export const ClipboardService = {
  copyMessage: async (content: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
        toast.success('Message copied to clipboard');
        return true;
      } else {
        // Fallback for older browsers
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
          return true;
        } catch (err) {
          toast.error('Failed to copy message');
          return false;
        } finally {
          textArea.remove();
        }
      }
    } catch (err) {
      console.error('Copy error:', err);
      toast.error('Failed to copy message');
      return false;
    }
  }
};

// Touch/Context Menu Service
export class ContextMenuManager {
  private longPressTimer: NodeJS.Timeout | null = null;

  constructor(
    private setContextMenu: React.Dispatch<React.SetStateAction<any>>,
    private messages: Message[]
  ) {}

  handleContextMenu = (
    e: React.MouseEvent,
    messageId: string | number,
    messageContent: string,
    senderId: string,
    currentUserId: string | null
  ) => {
    e.preventDefault();

    const canDelete = senderId === currentUserId;
    const messageElement = e.currentTarget as HTMLElement;

    // Find message attachments if any
    const message = this.messages.find(m => m.id === messageId);
    const attachments = message?.attachments || [];

    this.setContextMenu({
      messageId,
      messageContent,
      messageElement,
      canDelete,
      attachments
    });
  };

  handleTouchStart = (
    messageId: string | number,
    messageContent: string,
    senderId: string,
    element: HTMLElement,
    currentUserId: string | null
  ) => {
    this.longPressTimer = setTimeout(() => {
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      const canDelete = senderId === currentUserId;
      const message = this.messages.find(m => m.id === messageId);
      const attachments = message?.attachments || [];

      this.setContextMenu({
        messageId,
        messageContent,
        messageElement: element,
        canDelete,
        attachments
      });
    }, 500);
  };

  handleTouchEnd = () => {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  };

  cleanup = () => {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  };
}

// User Profile Service
export class UserProfileManager {
  constructor(
    private setUserProfiles: React.Dispatch<React.SetStateAction<Record<string, UserProfile>>>,
    private userProfiles: Record<string, UserProfile>
  ) {}

  getUserProfile = (userId: string, participants: any[]): UserProfile | null => {
    if (this.userProfiles[userId]) {
      return this.userProfiles[userId];
    }

    if (participants.length > 0) {
      const participant = participants.find(p => p.user_id === userId);
      if (participant) {
        const profile = {
          id: participant.user_id,
          name: participant.display_name || 'User',
          avatar: participant.avatar_url || participant.display_name?.charAt(0)?.toUpperCase() || 'U',
          email: participant.email || ''
        };

        this.setUserProfiles(prev => ({ ...prev, [userId]: profile }));
        return profile;
      }
    }

    return null;
  };

  buildProfilesFromParticipants = (participants: any[]) => {
    if (participants.length > 0) {
      const profilesFromParticipants: Record<string, UserProfile> = {};
      participants.forEach(participant => {
        profilesFromParticipants[participant.user_id] = {
          id: participant.user_id,
          name: participant.display_name || 'User',
          avatar: participant.avatar_url || participant.display_name?.charAt(0)?.toUpperCase() || 'U',
          email: participant.email || ''
        };
      });
      this.setUserProfiles(prev => ({ ...prev, ...profilesFromParticipants }));
    }
  };
}

// ─── Updated: Query the “channels” table (not “conversations”) ───
export async function getConversationById(id: string) {
  const { data, error } = await supabase
    .from('channels')   // ← was “conversations”
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('[getConversationById] Error fetching conversation:', error);
    return null;
  }

  return data;
}
