// hooks/useChatState.ts - Main chat state management hook
import { useState, useEffect, useRef, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'react-hot-toast';
import { useRealtimeInsert } from '@/hooks/useRealtimeInsert';
import { useMessages } from '@/hooks/useMessages';
import {
  sendMessage,
  createOptimisticMessage,
  transformRealtimeMessage,
  getUserProfileFromParticipants,
  buildUserProfilesCache,
  type Message,
  type UserProfile
} from '@/utils/chatPageUtils';
import type { Conversation } from '@/app/dashboard/[id]/messages/_components/ChatSidebar';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface UseChatStateOptions {
  onChatSelect?: (chat: Conversation) => void;
  onConversationDeleted?: (channelId: string) => void;
}

export function useChatState(options: UseChatStateOptions = {}) {
  // Core state
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [authLoading, setAuthLoading] = useState(true);
  const [realtimeMessages, setRealtimeMessages] = useState<Message[]>([]);
  
  // Refs
  const isMounted = useRef(true);

  // Use messages hook
  const { 
    messages: baseMessages, 
    loading: loadingMessages, 
    error: messagesError, 
    profiles: messageProfiles,
    refetch: refetchMessages 
  } = useMessages({
    channelId: selectedChat?.id || null,
    enabled: !!selectedChat && !!currentUserId && !authLoading
  });

  // Combine messages with smart deduplication
  const allMessages = (() => {
    const messageMap = new Map<string | number, Message>();
    
    // Add all base messages (these are the "truth")
    baseMessages.forEach(msg => {
      messageMap.set(msg.id, msg);
    });
    
    // Only add realtime messages that don't exist in base messages
    realtimeMessages.forEach(msg => {
      if (!messageMap.has(msg.id)) {
        // For temporary messages, check if a similar message exists in base
        if (String(msg.id).startsWith('temp-')) {
          const similar = baseMessages.find(baseMsg => 
            baseMsg.content === msg.content &&
            baseMsg.sender.id === msg.sender.id &&
            Math.abs(new Date(baseMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 10000
          );
          
          if (!similar) {
            messageMap.set(msg.id, msg);
          }
        } else {
          messageMap.set(msg.id, msg);
        }
      }
    });
    
    return Array.from(messageMap.values()).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  })();

  // Initialize authentication
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setAuthLoading(true);
        console.log("[useChatState] Initializing authentication");
        
        const { data, error } = await supabase.auth.getUser();
        
        if (error) {
          console.error("[useChatState] Auth error:", error);
          setCurrentUserId(null);
          return;
        }
        
        if (data?.user?.id) {
          console.log("[useChatState] User authenticated:", data.user.id);
          setCurrentUserId(data.user.id);
        } else {
          console.log("[useChatState] No authenticated user found");
          setCurrentUserId(null);
        }
      } catch (err) {
        console.error("[useChatState] Auth initialization error:", err);
        setCurrentUserId(null);
      } finally {
        setAuthLoading(false);
      }
    };

    initializeAuth();
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Clear realtime messages when switching chats
  useEffect(() => {
    console.log('[useChatState] Clearing realtime messages for chat switch');
    setRealtimeMessages([]);
  }, [selectedChat?.id]);

  // Cleanup realtime messages when base messages load
  useEffect(() => {
    if (baseMessages.length > 0 && realtimeMessages.length > 0) {
      console.log('[useChatState] Base messages loaded, cleaning up realtime messages');
      
      const now = Date.now();
      setRealtimeMessages(prev => {
        const cleaned = prev.filter(realtimeMsg => {
          // If it's older than 30 seconds, remove it
          const msgTime = new Date(realtimeMsg.timestamp).getTime();
          if (now - msgTime > 30000) {
            return false;
          }
          
          // If it exists in base messages, remove it
          const existsInBase = baseMessages.some(baseMsg => {
            if (baseMsg.id === realtimeMsg.id) return true;
            
            if (String(realtimeMsg.id).startsWith('temp-')) {
              return baseMsg.content === realtimeMsg.content &&
                     baseMsg.sender.id === realtimeMsg.sender.id &&
                     Math.abs(new Date(baseMsg.timestamp).getTime() - msgTime) < 10000;
            }
            
            return false;
          });
          
          return !existsInBase;
        });
        
        return cleaned;
      });
    }
  }, [baseMessages]);

  // Update profiles when message profiles change
  useEffect(() => {
    if (messageProfiles && Object.keys(messageProfiles).length > 0) {
      setUserProfiles(prev => ({ ...prev, ...messageProfiles }));
    }
  }, [messageProfiles]);

  // Update profiles when chat participants change
  useEffect(() => {
    if (selectedChat?.participants) {
      const profilesFromParticipants = buildUserProfilesCache(selectedChat.participants);
      setUserProfiles(prev => ({ ...prev, ...profilesFromParticipants }));
    }
  }, [selectedChat?.participants]);

  // Get user profile helper
  const getUserProfile = useCallback((userId: string): UserProfile | null => {
    if (userProfiles[userId]) {
      return userProfiles[userId];
    }
    
    if (selectedChat?.participants) {
      const profile = getUserProfileFromParticipants(userId, selectedChat.participants);
      if (profile) {
        setUserProfiles(prev => ({ ...prev, [userId]: profile }));
        return profile;
      }
    }
    
    return null;
  }, [userProfiles, selectedChat?.participants]);

  // Realtime message handler
  const handleRealtimeMessage = useCallback((newMsg: any) => {
    console.log('[useChatState] 🔥 REALTIME MESSAGE:', {
      messageId: newMsg.id,
      channelId: newMsg.channel_id,
      selectedChatId: selectedChat?.id
    });
    
    if (!isMounted.current || !selectedChat || newMsg.channel_id !== selectedChat.id) {
      return;
    }
    
    // Strict duplicate check
    const existsInBase = baseMessages.some(msg => msg.id === newMsg.id);
    const existsInRealtime = realtimeMessages.some(msg => msg.id === newMsg.id);
    
    if (existsInBase || existsInRealtime) {
      return;
    }
    
    // Show toast for messages from other users
    if (newMsg.sender_id !== currentUserId) {
      toast.success('New message received!');
    }
    
    // Get sender profile
    let senderProfile = userProfiles[newMsg.sender_id];
    if (!senderProfile && selectedChat?.participants) {
      senderProfile = getUserProfileFromParticipants(newMsg.sender_id, selectedChat.participants);
    }
    
    if (!senderProfile) {
      senderProfile = {
        id: newMsg.sender_id,
        name: 'Unknown User',
        avatar: newMsg.sender_id.charAt(0).toUpperCase(),
        email: ''
      };
    }
    
    const transformedMessage = transformRealtimeMessage(newMsg, senderProfile);
    
    setRealtimeMessages(prev => {
      if (prev.some(msg => msg.id === transformedMessage.id)) {
        return prev;
      }
      return [...prev, transformedMessage];
    });
  }, [currentUserId, selectedChat?.id, selectedChat?.participants, userProfiles, baseMessages, realtimeMessages]);

  // Realtime subscription
  useRealtimeInsert({
    supabase,
    table: 'messages',
    filter: selectedChat ? `channel_id=eq.${selectedChat.id}` : undefined,
    enabled: !!selectedChat && !!currentUserId && !authLoading,
    onInsert: handleRealtimeMessage,
  });

  // Send message handler
  const handleSendMessage = useCallback(async (e: React.FormEvent, attachments: any[] = []) => {
    e.preventDefault();
    
    if ((!messageText.trim() && !attachments.length) || !selectedChat || !currentUserId) {
      if (!messageText.trim() && !attachments.length) return;
      toast.error("Cannot send message - please try again");
      return;
    }
    
    const messageContent = messageText.trim() || '';
    setMessageText('');
    
    const userProfile = getUserProfile(currentUserId) || {
      id: currentUserId,
      name: 'You',
      avatar: currentUserId.charAt(0).toUpperCase(),
      email: ''
    };
    
    const optimisticMessage = createOptimisticMessage(currentUserId, messageContent, userProfile, attachments);
    setRealtimeMessages(prev => [...prev, optimisticMessage]);
    
    try {
      await sendMessage(selectedChat.id, currentUserId, messageContent, attachments);
    } catch (err) {
      console.error('[useChatState] Error sending message:', err);
      setRealtimeMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id));
      toast.error("Failed to send message");
    }
  }, [messageText, selectedChat, currentUserId, getUserProfile]);

  // Event handlers
  const handleSelectChat = useCallback((chat: Conversation) => {
    setSelectedChat(chat);
    setUserProfiles({});
    setRealtimeMessages([]);
    toast.success(`Chat opened: ${chat.channel_name || 'New conversation'}`);
    options.onChatSelect?.(chat);
  }, [options]);

  const handleBackToConversations = useCallback(() => {
    setSelectedChat(null);
    setUserProfiles({});
    setRealtimeMessages([]);
  }, []);

  const handleMessageDelete = useCallback((messageId: string | number) => {
    setRealtimeMessages(prev => prev.filter(msg => msg.id !== messageId));
    refetchMessages();
  }, [refetchMessages]);

  const handleConversationDeleted = useCallback((channelId: string) => {
    handleBackToConversations();
    options.onConversationDeleted?.(channelId);
  }, [handleBackToConversations, options]);

  return {
    // State
    selectedChat,
    currentUserId,
    messageText,
    setMessageText,
    authLoading,
    loadingMessages,
    messagesError,
    allMessages,
    
    // Handlers
    handleSelectChat,
    handleBackToConversations,
    handleSendMessage,
    handleMessageDelete,
    handleConversationDeleted,
    
    // Utils
    refetchMessages,
    getUserProfile
  };
}