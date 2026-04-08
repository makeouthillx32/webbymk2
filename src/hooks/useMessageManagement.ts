// hooks/useMessageManagement.ts - Clean message handling
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

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface UseMessageManagementProps {
  selectedChat: any | null;
  currentUserId: string | null;
  authLoading: boolean;
}

export function useMessageManagement({ 
  selectedChat, 
  currentUserId, 
  authLoading 
}: UseMessageManagementProps) {
  // Message state
  const [messageText, setMessageText] = useState('');
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
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

  // Combine base messages with realtime messages and remove duplicates
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

  // Clear realtime messages when switching chats
  useEffect(() => {
    console.log('[useMessageManagement] Clearing realtime messages for chat switch');
    setRealtimeMessages([]);
  }, [selectedChat?.id]);

  // Cleanup realtime messages when base messages load
  useEffect(() => {
    if (baseMessages.length > 0 && realtimeMessages.length > 0) {
      console.log('[useMessageManagement] Base messages loaded, cleaning up realtime messages');
      
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
      console.log('[useMessageManagement] Updating profiles from messages:', Object.keys(messageProfiles));
      setUserProfiles(prev => ({ ...prev, ...messageProfiles }));
    }
  }, [messageProfiles]);

  // Update profiles when chat participants change
  useEffect(() => {
    if (selectedChat?.participants) {
      const profilesFromParticipants = buildUserProfilesCache(selectedChat.participants);
      console.log('[useMessageManagement] Built profiles from participants:', Object.keys(profilesFromParticipants));
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
    console.log('[useMessageManagement] 🔥 REALTIME MESSAGE:', {
      messageId: newMsg.id,
      channelId: newMsg.channel_id,
      senderId: newMsg.sender_id,
      content: newMsg.content?.substring(0, 30) + '...',
      selectedChatId: selectedChat?.id
    });
    
    if (!isMounted.current) {
      console.log('[useMessageManagement] Component unmounted, ignoring message');
      return;
    }
    
    if (!selectedChat || newMsg.channel_id !== selectedChat.id) {
      console.log(`[useMessageManagement] Message for different channel, ignoring`);
      return;
    }
    
    // STRICT duplicate check - don't add if it exists anywhere
    const existsInBase = baseMessages.some(msg => msg.id === newMsg.id);
    const existsInRealtime = realtimeMessages.some(msg => msg.id === newMsg.id);
    
    if (existsInBase || existsInRealtime) {
      console.log('[useMessageManagement] Message already exists, skipping:', newMsg.id);
      return;
    }
    
    // Show toast for messages from other users only
    if (newMsg.sender_id !== currentUserId) {
      toast.success('New message received!');
    }
    
    // Get sender profile
    let senderProfile = userProfiles[newMsg.sender_id];
    if (!senderProfile && selectedChat?.participants) {
      senderProfile = getUserProfileFromParticipants(newMsg.sender_id, selectedChat.participants);
    }
    
    // If still no profile, create a basic one
    if (!senderProfile) {
      senderProfile = {
        id: newMsg.sender_id,
        name: 'Unknown User',
        avatar: newMsg.sender_id.charAt(0).toUpperCase(),
        email: ''
      };
    }
    
    // Transform the message
    const transformedMessage = transformRealtimeMessage(newMsg, senderProfile);
    console.log('[useMessageManagement] ✅ Adding realtime message:', transformedMessage.id);
    
    // ADD MESSAGE IMMEDIATELY to realtime messages
    setRealtimeMessages(prev => {
      // Double-check it doesn't exist before adding
      if (prev.some(msg => msg.id === transformedMessage.id)) {
        console.log('[useMessageManagement] Message already in realtime array, skipping');
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
    
    // Get user profile for optimistic message
    const userProfile = getUserProfile(currentUserId) || {
      id: currentUserId,
      name: 'You',
      avatar: currentUserId.charAt(0).toUpperCase(),
      email: ''
    };
    
    // Create optimistic message for immediate UI feedback
    const optimisticMessage = createOptimisticMessage(currentUserId, messageContent, userProfile, attachments);
    console.log('[useMessageManagement] Adding optimistic message:', optimisticMessage.id);
    
    // Add optimistic message immediately
    setRealtimeMessages(prev => [...prev, optimisticMessage]);
    
    try {
      await sendMessage(selectedChat.id, currentUserId, messageContent, attachments);
      console.log('[useMessageManagement] Message sent successfully');
      
      // The optimistic message will be cleaned up automatically when the real message arrives
      
    } catch (err) {
      console.error('[useMessageManagement] Error sending message:', err);
      
      // Only remove optimistic message on error
      setRealtimeMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id));
      toast.error("Failed to send message");
    }
  }, [messageText, selectedChat, currentUserId, getUserProfile]);

  // Message delete handler
  const handleMessageDelete = useCallback((messageId: string | number) => {
    console.log("[useMessageManagement] Message deleted:", messageId);
    
    // Remove from realtime messages if it exists there
    setRealtimeMessages(prev => prev.filter(msg => msg.id !== messageId));
    
    // Refetch base messages to update the list
    refetchMessages();
  }, [refetchMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  return {
    // Message data
    allMessages,
    messageText,
    setMessageText,
    loadingMessages,
    messagesError,
    
    // Handlers
    handleSendMessage,
    handleMessageDelete,
    
    // Utils
    refetchMessages,
    getUserProfile
  };
}